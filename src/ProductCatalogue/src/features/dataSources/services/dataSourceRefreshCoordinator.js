const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function createDataSourceRefreshCoordinator({
  compatibilityRefreshService,
  dataSourceController,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  timer = globalThis.window,
  onRefreshComplete,
} = {}) {
  let isRefreshing = false;
  let autoRefreshEnabled = true;
  let intervalId = null;

  compatibilityRefreshService?.stopAuto?.();

  async function refresh({ source = "manual" } = {}) {
    if (isRefreshing) {
      return {
        success: false,
        skipped: true,
        reason: "already-refreshing",
        source,
      };
    }

    isRefreshing = true;
    try {
      const [compatibilityOutcome, dataSourceOutcome] = await Promise.allSettled([
        compatibilityRefreshService.refresh({ source }),
        dataSourceController.refreshActive({
          reason: `${source}-refresh`,
          silent: source !== "manual",
        }),
      ]);

      const compatibilityResult =
        compatibilityOutcome.status === "fulfilled"
          ? compatibilityOutcome.value
          : { success: false, error: compatibilityOutcome.reason };
      const dataSourceResult =
        dataSourceOutcome.status === "fulfilled"
          ? dataSourceOutcome.value
          : { success: false, error: dataSourceOutcome.reason };
      const result = {
        success:
          compatibilityResult?.success !== false &&
          dataSourceResult?.success !== false &&
          (dataSourceResult?.failedSourceIds?.length ?? 0) === 0,
        skipped: false,
        source,
        compatibilityResult,
        dataSourceResult,
      };
      onRefreshComplete?.(result);
      return result;
    } finally {
      isRefreshing = false;
    }
  }

  function startAuto() {
    stopAuto();
    intervalId = timer?.setInterval?.(() => {
      if (autoRefreshEnabled) {
        void refresh({ source: "auto" });
      }
    }, refreshIntervalMs);
  }

  function stopAuto() {
    if (intervalId === null) {
      return;
    }

    timer?.clearInterval?.(intervalId);
    intervalId = null;
  }

  function setAuto(enabled) {
    autoRefreshEnabled = Boolean(enabled);
    if (autoRefreshEnabled) {
      startAuto();
    } else {
      stopAuto();
    }
  }

  return {
    refresh,
    startAuto,
    stopAuto,
    setAuto,
    isAutoEnabled: () => autoRefreshEnabled,
    isRefreshInProgress: () =>
      isRefreshing || Boolean(compatibilityRefreshService?.isRefreshInProgress?.()),
    destroy: stopAuto,
  };
}
