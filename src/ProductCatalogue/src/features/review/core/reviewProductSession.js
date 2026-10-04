import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { normalizeReviewProductItems } from "../domain/reviewProductList.js";

// This is the sole Review data-generation owner. Retained records carry pending work
// across composition edits; a full load replaces the generation and all records.
export function createReviewProductSession({ loadProduct, prepare = async () => {}, onChange }) {
  let generation = 0;
  let disposed = false;
  let items = [];
  const records = new Map();
  const payloads = new Map();

  const owns = (record, operation) =>
    !disposed &&
    operation.generation === generation &&
    records.get(record.id) === record &&
    record.operation === operation;

  const snapshot = () => ({
    products: items
      .filter((item) => item.enabled)
      .map((item) => {
        const record = records.get(item.id);
        return (
          (record?.identity ? payloads.get(record.identity) : record?.failure) ?? {
            datasetName: item.datasetName,
            loadState: "loading",
          }
        );
      }),
    loading: items.some((item) => item.enabled && records.get(item.id)?.operation?.visible),
  });

  const publish = () => {
    if (!disposed) onChange(snapshot());
  };

  const discard = (record) => {
    if (record.identity) payloads.delete(record.identity);
    records.delete(record.id);
  };

  const start = (record, { visible, ready }) => {
    if (record.operation) return record.operation.promise;
    const operation = { generation, visible, promise: null };
    record.operation = operation;
    operation.promise = (async () => {
      try {
        await ready;
        if (!owns(record, operation)) return false;
        const product = await loadProduct(record.datasetName);
        if (!owns(record, operation)) return false;
        if (normalizeKey(product?.datasetName) !== record.id) {
          throw new Error("Review Product response identity mismatch.");
        }
        const context = product.productContext;
        const identity = context ? serializeProductIdentity(context) : null;
        if (context && normalizeKey(context.datasetName) !== record.id) {
          throw new Error("Review Product context identity mismatch.");
        }
        if (!identity && product.loadState !== "failed") {
          throw new Error("Review Product response is missing source identity.");
        }
        if (
          identity &&
          [...records.values()].some((other) => other !== record && other.identity === identity)
        ) {
          throw new Error("Review Product source identity is ambiguous.");
        }
        if (record.identity) payloads.delete(record.identity);
        record.identity = identity;
        record.failure = identity ? null : product;
        if (identity) payloads.set(identity, product);
        return true;
      } catch (error) {
        if (!owns(record, operation)) return false;
        if (!visible) {
          // A rejected loader invocation differs from a returned per-content
          // failure: retain the last payload and let FI-022 retry its revision.
          console.warn("[Review] Automatic workspace refresh failed", error);
          return false;
        }
        if (record.identity) payloads.delete(record.identity);
        record.identity = null;
        record.failure = {
          datasetName: record.datasetName,
          sourceId: null,
          productContext: null,
          loadState: "failed",
          history: null,
          error: error instanceof Error ? error.message : "Unknown review error.",
        };
        return true;
      } finally {
        if (owns(record, operation)) {
          record.operation = null;
          publish();
        }
      }
    })();
    return operation.promise;
  };

  const reconcile = async (nextItems, { full = false } = {}) => {
    if (disposed) return false;
    if (full) {
      generation += 1;
      records.clear();
      payloads.clear();
    }
    items = normalizeReviewProductItems(nextItems);
    const ids = new Set(items.map((item) => item.id));
    for (const record of records.values()) {
      if (!ids.has(record.id)) discard(record);
    }
    const newRecords = [];
    for (const item of items) {
      if (!records.has(item.id)) {
        records.set(item.id, {
          id: item.id,
          datasetName: item.datasetName,
          identity: null,
          failure: null,
          operation: null,
        });
      }
      const record = records.get(item.id);
      if (item.enabled && !record.identity && !record.failure && !record.operation) {
        newRecords.push(record);
      }
    }
    const currentGeneration = generation;
    // Preparation primes revisions before payload reads. It is shared by all new
    // Products in this operation, while the Product loads themselves run concurrently.
    const ready =
      full || newRecords.length > 0
        ? Promise.resolve(
            prepare(
              newRecords.map((record) => record.datasetName),
              { full }
            )
          )
        : Promise.resolve();
    const work = newRecords.map((record) => start(record, { visible: true, ready }));
    publish();
    await Promise.all([ready, ...work]);
    return !disposed && currentGeneration === generation;
  };

  const refresh = async (datasetNames) => {
    if (disposed) return false;
    const currentGeneration = generation;
    const keys = new Set(datasetNames.map(normalizeKey));
    const selected = items
      .filter((item) => item.enabled && keys.has(item.id))
      .map((item) => records.get(item.id));
    // onChanged acknowledges the whole changed set atomically. A disabled or
    // removed Product must not disappear from that obligation through filtering.
    if (selected.length !== keys.size) return false;
    // A revision check during an initial/full/add load must be retried, not
    // acknowledged against a payload request which may predate that revision.
    if (selected.some((record) => !record || record.operation)) return false;
    const work = selected.map((record) =>
      start(record, { visible: false, ready: Promise.resolve() })
    );
    const accepted = await Promise.all(work);
    return (
      !disposed &&
      generation === currentGeneration &&
      accepted.every(Boolean) &&
      selected.every(
        (record) =>
          records.get(record.id) === record &&
          items.some((item) => item.id === record.id && item.enabled)
      )
    );
  };

  return {
    reconcile,
    refresh,
    destroy() {
      disposed = true;
      generation += 1;
      records.clear();
      payloads.clear();
      items = [];
    },
  };
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
