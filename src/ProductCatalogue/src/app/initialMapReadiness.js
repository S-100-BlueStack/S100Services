// Data-source completion does not imply the first MapView frame is ready. Wait
// for the visible layer views and a short quiet period, but bound the wait so
// stalled basemap services never leave the entire application inaccessible.
export function waitForInitialMapReadiness({
  view,
  layers = [],
  observeUpdating,
  stableMs = 500,
  timeoutMs = 60_000,
  signal,
  schedule = setTimeout,
  cancelScheduled = clearTimeout,
} = {}) {
  if (!view || typeof view.when !== "function" || typeof observeUpdating !== "function") {
    return Promise.resolve({ status: "unavailable", failedLayerViews: 0 });
  }

  return new Promise((resolve) => {
    let settled = false;
    let viewReady = false;
    let watchHandle = null;
    let stableTimer = null;
    let layerViews = [];
    let failedLayerViews = 0;
    const startedAt = Date.now();

    const timeoutTimer = schedule(() => finish("timeout"), timeoutMs);

    function stopStableTimer() {
      if (stableTimer === null) return;
      cancelScheduled(stableTimer);
      stableTimer = null;
    }

    function finish(status, error = null) {
      if (settled) return;
      settled = true;
      cancelScheduled(timeoutTimer);
      stopStableTimer();
      watchHandle?.remove?.();
      signal?.removeEventListener?.("abort", abort);
      resolve({ status, failedLayerViews, elapsedMs: Date.now() - startedAt, error });
    }

    function abort() {
      finish("aborted");
    }

    function isIdle() {
      return (
        view.updating === false &&
        view.stationary !== false &&
        layerViews.every((layerView) => layerView?.updating === false)
      );
    }

    function checkReadiness() {
      if (settled || !viewReady) return;
      if (view.destroyed) {
        finish("unavailable");
        return;
      }
      if (!isIdle()) {
        stopStableTimer();
        return;
      }
      if (stableTimer !== null) return;

      stableTimer = schedule(() => {
        stableTimer = null;
        if (settled) return;
        if (isIdle()) {
          finish(failedLayerViews ? "partial" : "ready");
        } else {
          checkReadiness();
        }
      }, stableMs);
    }

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener?.("abort", abort, { once: true });

    async function waitForMap() {
      try {
        await view.when();
        if (settled) return;

        // The source controller commits GraphicsLayers before its initialization
        // resolves, but does not await their layer views. Do that here without
        // causing additional data-source requests or using private SDK APIs.
        const visibleLayers = layers.filter((layer) => layer && layer.visible !== false);
        const results = await Promise.allSettled(
          visibleLayers.map((layer) => view.whenLayerView(layer))
        );
        if (settled) return;

        failedLayerViews = results.filter((result) => result.status === "rejected").length;
        layerViews = results
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        viewReady = true;
        watchHandle = observeUpdating(checkReadiness, layerViews);
        if (settled) {
          watchHandle?.remove?.();
          return;
        }
        checkReadiness();
      } catch (error) {
        finish("error", error);
      }
    }

    void waitForMap();
  });
}
