export function createPackageCreationSession({ service, onCatalogueChange, onState }) {
  let alive = true;
  let request = null;
  let reconciliation = null;
  let state = { status: "draft" };

  function publish(next) {
    state = next;
    if (alive) onState(state);
  }

  function accept(result) {
    if (result.status === "confirmed" || result.status === "unknown") {
      onCatalogueChange({
        membership: result.status === "unknown" || result.item.pipelineIds.length > 0,
      });
    }
    publish(
      result.status === "confirmed" ? { ...result, submittedUri: request.absoluteUri } : result
    );
  }

  return {
    snapshot: () => state,
    async submit(payload) {
      if (!alive || !["draft", "rejected"].includes(state.status)) return;
      request = payload;
      publish({ status: "pending" });
      let result;
      try {
        result = await service.create(request);
      } catch (error) {
        result = { status: "unknown", message: error.message };
      }
      if (alive) accept(result);
    },
    async reconcile() {
      if (!alive || state.status !== "unknown" || !state.knownId || reconciliation) return;
      const current = state;
      reconciliation = new AbortController();
      publish({ ...current, checking: true });
      try {
        const item = await service.reconcile(current.knownId, request, {
          signal: reconciliation.signal,
        });
        if (alive) accept({ status: "confirmed", item });
      } catch (error) {
        if (alive) publish({ ...current, message: `Read-only check failed: ${error.message}` });
      } finally {
        reconciliation = null;
      }
    },
    reset({ abandon = false } = {}) {
      if (
        !alive ||
        state.status === "pending" ||
        reconciliation ||
        (state.status === "unknown" && !abandon)
      ) {
        return false;
      }
      request = null;
      publish({ status: "draft" });
      return true;
    },
    destroy() {
      alive = false;
      reconciliation?.abort();
      // A dispatched create has a deadline and may already be committing on the server.
    },
  };
}
