// Targeted status reads publish through the existing source controller lifecycle.
// A Product-detail drift observation never mutates a Graphic directly.
export const SOURCE_STATUS_REFRESH_COOLDOWN_MS = 30_000;

export function createSourceStatusRefreshCoordinator({
  dataSourceController,
  isGlobalRefreshInProgress = () => false,
  now = Date.now,
  cooldownMs = SOURCE_STATUS_REFRESH_COOLDOWN_MS,
} = {}) {
  const inFlight = new Map();
  const lastRequestedAt = new Map();
  const sourceEpochs = new Map();
  let destroyed = false;

  // A full source reload/disable replaces the committed representation. Its
  // previous cooldown and pending status identity must not block a new load.
  const unsubscribe = dataSourceController?.subscribe?.((_states, detail) => {
    if (destroyed || detail?.type !== "state-changed" || !detail.sourceId) return;
    const state = dataSourceController.getState(detail.sourceId);
    if (state?.enabled && state.requestedEnabled && !state.loading) return;
    sourceEpochs.set(detail.sourceId, (sourceEpochs.get(detail.sourceId) ?? 0) + 1);
    for (const key of inFlight.keys()) {
      if (JSON.parse(key)[0] === detail.sourceId) inFlight.delete(key);
    }
    for (const key of lastRequestedAt.keys()) {
      if (JSON.parse(key)[0] === detail.sourceId) lastRequestedAt.delete(key);
    }
  });

  function request({ sourceId, datasetName } = {}) {
    if (destroyed) return Promise.resolve({ success: false, reason: "destroyed" });
    const id = String(sourceId ?? "").trim();
    const name = String(datasetName ?? "").trim();
    if (!id || !name) return Promise.resolve({ success: false, reason: "invalid-identity" });
    // Dataset names and map status identity are case-insensitive within a source.
    // Keep unrelated Products independent while coalescing repeated drift signals.
    const key = JSON.stringify([id, name.toUpperCase()]);
    const state = dataSourceController?.getState?.(id);
    if (!state?.enabled || !state.requestedEnabled) {
      return Promise.resolve({ success: false, reason: "inactive-source" });
    }
    if (state.loading || isGlobalRefreshInProgress()) {
      return Promise.resolve({ success: false, reason: "refresh-in-progress" });
    }
    if (inFlight.has(key)) return inFlight.get(key);

    const timestamp = now();
    const previous = lastRequestedAt.get(key);
    if (previous !== undefined && timestamp - previous < cooldownMs) {
      return Promise.resolve({ success: false, reason: "cooldown" });
    }

    // Delay invocation one microtask so concurrent drift observations share the
    // same operation. A source reload can retire this request before it starts.
    const sourceEpoch = sourceEpochs.get(id) ?? 0;
    const pending = Promise.resolve()
      .then(() => {
        if (destroyed) return { success: false, reason: "destroyed" };
        if ((sourceEpochs.get(id) ?? 0) !== sourceEpoch) {
          return { success: false, reason: "source-unavailable" };
        }
        const current = dataSourceController?.getState?.(id);
        if (
          !current?.enabled ||
          !current.requestedEnabled ||
          current.loading ||
          isGlobalRefreshInProgress()
        ) {
          return { success: false, reason: "source-unavailable" };
        }
        lastRequestedAt.set(key, now());
        return dataSourceController.refreshProductStatus(id, name);
      })
      .catch((error) => {
        if (!destroyed) console.warn("[Data sources] Popup status refresh failed", error);
        return { success: false, error };
      })
      .finally(() => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      });
    inFlight.set(key, pending);
    return pending;
  }

  function destroy() {
    destroyed = true;
    unsubscribe?.();
    inFlight.clear();
    lastRequestedAt.clear();
    sourceEpochs.clear();
  }

  return { request, destroy };
}
