import {
  BindingRequestTimeoutError,
  withBindingRequestDeadline,
} from "./withBindingRequestDeadline.js";

const DEFAULT_BINDING_REQUEST_TIMEOUT_MS = 30_000;

function bindingRecord(bindings) {
  return {
    relations: Object.fromEntries(
      bindings.map((binding) => [
        binding.pipelineId,
        {
          active: true,
          comments: [],
          bindingId: binding.id,
          workspaces: binding.workspaces,
        },
      ])
    ),
  };
}

export class BindingSaveError extends Error {
  constructor(message, { record = null, outcomes = [], requiresReconciliation = false } = {}) {
    super(message);
    this.name = "BindingSaveError";
    this.record = record;
    this.outcomes = outcomes;
    this.requiresReconciliation = requiresReconciliation;
  }
}

function hasUncertainOutcome(error) {
  return (
    error instanceof BindingRequestTimeoutError ||
    error?.name === "AbortError" ||
    error?.kind === "network" ||
    (Number.isInteger(error?.status) && error.status >= 500)
  );
}

export function createLiveAssignmentServices(
  catalogue,
  { bindingRequestTimeoutMs = DEFAULT_BINDING_REQUEST_TIMEOUT_MS } = {}
) {
  const pending = new Map();
  const request = (stage, operation, signal) =>
    withBindingRequestDeadline(operation, {
      stage,
      timeoutMs: bindingRequestTimeoutMs,
      signal,
    });
  const readBindings = (id, signal) =>
    request(
      "Binding catalogue read",
      ({ signal: requestSignal }) => catalogue.bindings(id, { signal: requestSignal }),
      signal
    );

  const assignments = {
    async load(id, { signal } = {}) {
      return bindingRecord(await readBindings(id, signal));
    },
    // Recovery is read-only. It must not repeat an unconfirmed POST or DELETE.
    async reconcile(id) {
      return bindingRecord(await readBindings(id));
    },
    save(id, draft) {
      if (pending.has(id)) return pending.get(id);
      const desired = [...new Set(draft.activeIds)];
      const operation = saveBindings(id, desired, draft.comments).finally(() => pending.delete(id));
      pending.set(id, operation);
      return operation;
    },
  };

  async function saveBindings(id, desired, comments = []) {
    if (comments.length) throw new Error("Comments are available only in demo mode.");
    // Preflight is always authoritative. A previous unsuccessful response may have committed.
    const existing = await readBindings(id);
    const current = new Set(existing.map((binding) => binding.pipelineId));
    const changes = [
      ...desired
        .filter((pipelineId) => !current.has(pipelineId))
        .map((pipelineId) => ({
          pipelineId,
          action: "Add",
          run: (signal) => catalogue.bind(id, pipelineId, { signal }),
        })),
      ...existing
        .filter((binding) => !desired.includes(binding.pipelineId))
        .map((binding) => ({
          pipelineId: binding.pipelineId,
          action: "Remove",
          run: (signal) => catalogue.unbind(binding.id, { signal }),
        })),
    ];
    const outcomes = [];
    let successfulWrites = 0;

    // Preserve independent 4xx failures, but stop on uncertain transport/server outcomes.
    // Continuing the batch after a timed-out write could silently duplicate or undo it.
    for (const change of changes) {
      try {
        await request(`Binding ${change.action.toLowerCase()}`, ({ signal }) => change.run(signal));
        successfulWrites++;
        outcomes.push({ pipelineId: change.pipelineId, action: change.action, ok: true });
      } catch (error) {
        outcomes.push({
          pipelineId: change.pipelineId,
          action: change.action,
          ok: false,
          message: error.message,
        });
        if (hasUncertainOutcome(error)) {
          throw new BindingSaveError(
            `${change.action} ${change.pipelineId}: ${error.message} The server outcome is unknown. Check saved bindings before another Save. No remaining changes were sent.`,
            { outcomes, requiresReconciliation: true }
          );
        }
      }
    }

    const summary = outcomes
      .map(
        (item) =>
          `${item.action} ${item.pipelineId}: ${item.ok ? "succeeded" : `failed (${item.message})`}`
      )
      .join("; ");
    let record;
    try {
      record = await assignments.reconcile(id);
    } catch (error) {
      throw new BindingSaveError(
        `${summary ? `${summary}. ` : ""}Authoritative reload failed: ${error.message} ${successfulWrites ? "Check saved bindings before another Save." : "Retry Save to read the current bindings."}`,
        { outcomes, requiresReconciliation: successfulWrites > 0 }
      );
    }
    const actual = Object.keys(record.relations).sort();
    const matches = JSON.stringify(actual) === JSON.stringify([...desired].sort());
    if (outcomes.some((item) => !item.ok) || !matches) {
      throw new BindingSaveError(
        `${summary}. Bindings reloaded.${matches ? " Requested bindings are now present." : " Requested changes remain in the draft; review and retry."}`,
        { record, outcomes }
      );
    }
    return { ...record, saveMessage: summary || "Bindings reloaded; no changes required." };
  }

  return {
    source: "live",
    categories: catalogue.categories,
    features: {
      async search({ page = 0, pageSize = 25, type = "", status = "", search = "", signal } = {}) {
        if (search) throw new Error("Package name search is not supported by the v1 API.");
        const result = await catalogue.packages({
          page,
          pageSize,
          category: type,
          hasPipeline: status ? status === "Assigned" : undefined,
          signal,
        });
        return {
          ...result,
          items: result.items.map((item) => ({
            ...item,
            type: item.category,
            status: status || "Select to view bindings",
          })),
        };
      },
      async get(id, options) {
        const item = await catalogue.package(id, options);
        return { ...item, type: item.category };
      },
    },
    workStreams: {
      async list({ ids = null, signal } = {}) {
        const pipelines = await catalogue.pipelines({ signal });
        const items = ids === null ? pipelines : pipelines.filter((item) => ids.includes(item.id));
        return { items, total: items.length };
      },
    },
    assignments,
  };
}
