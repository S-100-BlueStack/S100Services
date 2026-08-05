const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function createDataSourceRefreshCoordinator({
  compatibilityRefreshService,
  dataSourceController,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  timer = globalThis.window,
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
      const [compatibilityResult, dataSourceResult] = await Promise.all([
        compatibilityRefreshService.refresh({ source }),
        dataSourceController.refreshActive({
          reason: `${source}-refresh`,
          silent: source !== "manual",
        }),
      ]);

      return {
        success:
          compatibilityResult?.success !== false &&
          (dataSourceResult?.failedSourceIds?.length ?? 0) === 0,
        skipped: false,
        source,
        compatibilityResult,
        dataSourceResult,
      };
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
