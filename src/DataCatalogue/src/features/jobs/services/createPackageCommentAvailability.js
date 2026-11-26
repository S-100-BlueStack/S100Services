import {
  BINDING_COMMENT_AVAILABILITY_LIMIT,
  bindingCommentKey,
} from "../../../shared/api/bindingComments.js";

const unknown = (binding) => ({ binding, status: "unknown", dirty: true });

export function createPackageCommentAvailability({ read, onChange }) {
  let entries = new Map();
  let sequence = null;
  let active = false;
  let deferred = false;
  let round = null;
  let refreshQueued = false;

  function cancel() {
    round?.abort();
    round = null;
    refreshQueued = false;
    for (const entry of entries.values()) {
      if (entry.status === "loading") entry.status = "unknown";
    }
  }

  function acceptJobs(nextSequence, jobs) {
    if (sequence === nextSequence) return;
    sequence = nextSequence;
    cancel();
    entries = new Map(
      jobs
        .filter((job) => job.source === "live" && job.packageId && job.pipelineId)
        .map(({ packageId, pipelineId }) => {
          const binding = { packageId, pipelineId };
          return [bindingCommentKey(binding), unknown(binding)];
        })
    );
    onChange();
    void refresh();
  }

  function setContext({ visible, busy }) {
    const wasReady = active && !deferred;
    active = visible;
    deferred = busy;
    if (!active) cancel();
    if (!wasReady && active && !deferred) void refresh({ retryErrors: true });
  }

  async function refresh({ retryErrors = false } = {}) {
    if (!active || deferred || round) return;
    const pending = [...entries].filter(
      ([, entry]) => entry.dirty && (retryErrors || entry.status !== "error")
    );
    if (!pending.length) return;

    const request = new AbortController();
    round = request;
    let offset = 0;
    for (const [, entry] of pending) entry.status = "loading";
    onChange();

    async function worker() {
      while (round === request && offset < pending.length) {
        const batch = pending.slice(offset, offset + BINDING_COMMENT_AVAILABILITY_LIMIT);
        offset += BINDING_COMMENT_AVAILABILITY_LIMIT;
        const bindings = batch
          .filter(([key, entry]) => entries.get(key) === entry)
          .map(([, entry]) => entry.binding);
        if (!bindings.length) continue;
        try {
          const values = await read(bindings, { signal: request.signal });
          if (round !== request) return;
          for (const [id, entry] of batch) {
            if (entries.get(id) !== entry) continue;
            const value = values.get(id);
            entry.status = value === true ? "present" : value === false ? "absent" : "unknown";
            entry.dirty = false;
          }
        } catch {
          if (round !== request) return;
          for (const [id, entry] of batch) {
            if (entries.get(id) === entry) entry.status = "error";
          }
        }
        onChange();
      }
    }

    const batchCount = Math.ceil(pending.length / BINDING_COMMENT_AVAILABILITY_LIMIT);
    await Promise.all(Array.from({ length: Math.min(2, batchCount) }, worker));
    if (round !== request) return;
    round = null;
    if (refreshQueued) {
      refreshQueued = false;
      void refresh();
    }
  }

  return {
    acceptJobs,
    setContext,
    getStatus: (binding) => entries.get(bindingCommentKey(binding))?.status ?? "unknown",
    invalidate(binding) {
      const id = bindingCommentKey(binding);
      if (!entries.has(id)) return;
      entries.set(id, unknown(entries.get(id).binding));
      onChange();
      if (round) refreshQueued = true;
      else void refresh();
    },
    observeFirstPage(binding) {
      const id = bindingCommentKey(binding);
      const revision = entries.get(id);
      return (hasComments) => {
        if (!revision || entries.get(id) !== revision) return;
        // Replace the captured entry so a pre-viewer batch cannot overwrite this observation.
        entries.set(id, { ...revision, status: hasComments ? "present" : "absent", dirty: false });
        onChange();
      };
    },
    destroy() {
      active = false;
      cancel();
      entries.clear();
    },
  };
}
