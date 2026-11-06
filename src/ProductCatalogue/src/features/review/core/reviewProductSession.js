import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { getReviewWorkUnitSignature } from "../domain/reviewWorkUnits.js";
import { normalizeReviewProductItems } from "../domain/reviewProductList.js";

// This is the sole Review data-generation owner. Retained records carry pending work
// across composition edits; a full load replaces the generation and all records.
export function createReviewProductSession({
  loadProduct,
  prepare = async () => {},
  resolveItems = null,
  onComposition = null,
  onChange,
}) {
  let generation = 0;
  let compositionVersion = 0;
  let resolvingComposition = false;
  let disposed = false;
  let items = [];
  let requestedItems = [];
  const pendingResolutions = new Map();
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
          (record?.identity
            ? record.refreshError
              ? { ...payloads.get(record.identity), refreshError: record.refreshError }
              : payloads.get(record.identity)
            : record?.failure) ?? {
            datasetName: item.datasetName,
            loadState: "loading",
          }
        );
      }),
    loading:
      resolvingComposition ||
      items.some((item) => item.enabled && records.get(item.id)?.operation?.visible),
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
        const product = await loadProduct(record.datasetName, {
          resolution: record.identity || record.failure ? null : record.resolution,
        });
        if (!owns(record, operation)) return false;
        if (normalizeKey(product?.datasetName) !== record.id) {
          throw new Error("Review Product response identity mismatch.");
        }
        if (record.workUnitSignature) {
          if (
            product.resolutionFailed ||
            product.workUnitSignature !== record.workUnitSignature ||
            !product.members ||
            getReviewWorkUnitSignature({
              status: "resolved",
              product: product.productContext,
              workUnit: product.workUnit,
              memberProducts: product.members.map((member) => member.productContext),
            }) !== record.workUnitSignature
          ) {
            throw new Error(product.error ?? "Review package identity or member mapping changed.");
          }
        }
        if (!visible && product.resolutionFailed) throw new Error(product.error);
        const context = product.productContext;
        const identity =
          product.workUnit?.identityKey ?? (context ? serializeProductIdentity(context) : null);
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
        record.refreshError = null;
        record.identity = identity;
        record.failure = identity ? null : product;
        if (identity) payloads.set(identity, product);
        return true;
      } catch (error) {
        if (!owns(record, operation)) return false;
        if (record.workUnitSignature && record.identity) {
          record.refreshError =
            error instanceof Error ? error.message : "Review package refresh failed.";
          return false;
        }
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

  const reconcile = async (nextItems, options = {}) => {
    const { full = false } = options;
    if (disposed) return false;
    const version = ++compositionVersion;
    const retained = full
      ? []
      : [...records.values()].map((record) => record.resolution).filter(Boolean);
    if (full) {
      generation += 1;
      records.clear();
      payloads.clear();
      pendingResolutions.clear();
    }
    const normalized = normalizeReviewProductItems(nextItems);
    requestedItems = normalized;
    const requestedKeys = new Set(normalized.map((item) => item.id));
    for (const key of pendingResolutions.keys()) {
      if (!requestedKeys.has(key)) pendingResolutions.delete(key);
    }
    // Removal and package eligibility edits revoke ownership at input time,
    // before another async canonicalization can yield to a member completion.
    for (const record of records.values()) {
      const requested = normalized.find((item) => item.id === record.id);
      if (!requested) discard(record);
      else if (!requested.enabled && record.workUnitSignature) record.operation = null;
    }
    const resolve = (name, load) => {
      if (disposed || version !== compositionVersion) {
        return Promise.resolve({
          status: "failed",
          requestedDatasetName: name,
          error: "Superseded Review composition.",
        });
      }
      const key = normalizeKey(name);
      if (!pendingResolutions.has(key)) {
        const promise = Promise.resolve().then(() => load(name));
        pendingResolutions.set(key, promise);
        void promise.then(
          (result) => {
            if (result.status !== "resolved" && pendingResolutions.get(key) === promise) {
              pendingResolutions.delete(key);
            }
          },
          () => {
            if (pendingResolutions.get(key) === promise) pendingResolutions.delete(key);
          }
        );
      }
      return pendingResolutions.get(key);
    };
    resolvingComposition = Boolean(resolveItems);
    if (resolvingComposition) publish();
    const composition = resolveItems
      ? await resolveItems(normalized, { full, retained, resolve })
      : { items: normalized, resolutions: [] };
    if (disposed || compositionVersion !== version) return false;
    resolvingComposition = false;
    items = normalizeReviewProductItems(
      onComposition?.(composition.items, options, composition.resolutions) ?? composition.items
    );
    requestedItems = items;
    const resolutions = new Map(
      composition.resolutions.map((resolution) => [
        normalizeKey(resolution.product?.datasetName ?? resolution.requestedDatasetName),
        resolution,
      ])
    );
    const ids = new Set(items.map((item) => item.id));
    for (const record of records.values()) {
      if (!ids.has(record.id)) discard(record);
    }
    const newRecords = [];
    for (const item of items) {
      const resolution = resolutions.get(item.id);
      if (
        resolution?.status !== "resolved" &&
        records.get(item.id)?.resolution?.status === "resolved"
      ) {
        discard(records.get(item.id));
      }
      if (!records.has(item.id)) {
        records.set(item.id, {
          resolution: resolutions.get(item.id) ?? null,
          workUnitSignature: getReviewWorkUnitSignature(resolutions.get(item.id)),
          refreshError: null,
          id: item.id,
          datasetName: item.datasetName,
          identity: null,
          failure: null,
          operation: null,
        });
      }
      const record = records.get(item.id);
      // Package member promises may not publish while the work unit is disabled.
      // Ordinary FI-039 records retain their established pending-load behavior.
      if (!item.enabled && record.workUnitSignature) record.operation = null;
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
    getItems: () => normalizeReviewProductItems(requestedItems),
    destroy() {
      disposed = true;
      generation += 1;
      compositionVersion += 1;
      pendingResolutions.clear();
      requestedItems = [];
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
