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
  let destroyed = false;

  function request({ sourceId, datasetName } = {}) {
    if (destroyed) return Promise.resolve({ success: false, reason: "destroyed" });
    const id = String(sourceId ?? "").trim();
    const name = String(datasetName ?? "").trim();
    if (!id || !name) return Promise.resolve({ success: false, reason: "invalid-identity" });
    if (inFlight.has(id)) return inFlight.get(id);

    const state = dataSourceController?.getState?.(id);
    if (!state?.enabled || !state.requestedEnabled) {
      return Promise.resolve({ success: false, reason: "inactive-source" });
    }
    if (state.loading || isGlobalRefreshInProgress()) {
      return Promise.resolve({ success: false, reason: "refresh-in-progress" });
    }

    const timestamp = now();
    const previous = lastRequestedAt.get(id);
    if (previous !== undefined && timestamp - previous < cooldownMs) {
      return Promise.resolve({ success: false, reason: "cooldown" });
    }

    // Delay invocation one microtask so concurrent drift observations share the
    // same operation even if an activation synchronously emits source events.
    const pending = Promise.resolve()
      .then(() => {
        if (destroyed) return { success: false, reason: "destroyed" };
        const current = dataSourceController?.getState?.(id);
        if (
          !current?.enabled ||
          !current.requestedEnabled ||
          current.loading ||
          isGlobalRefreshInProgress()
        ) {
          return { success: false, reason: "source-unavailable" };
        }
        lastRequestedAt.set(id, now());
        return dataSourceController.refreshProductStatus(id, name);
      })
      .catch((error) => {
        if (!destroyed) console.warn("[Data sources] Popup status refresh failed", error);
        return { success: false, error };
      })
      .finally(() => {
        if (inFlight.get(id) === pending) inFlight.delete(id);
      });
    inFlight.set(id, pending);
    return pending;
  }

  function destroy() {
    destroyed = true;
    inFlight.clear();
    lastRequestedAt.clear();
  }

  return { request, destroy };
}
