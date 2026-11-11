export const DEFAULT_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export function createDataSourceRefreshCoordinator({
  compatibilityRefreshService,
  dataSourceController,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  timer = globalThis.window,
  documentRef = globalThis.document,
  onRefreshComplete,
} = {}) {
  let isRefreshing = false;
  let autoRefreshEnabled = true;
  let intervalId = null;
  let refreshDeferredWhileHidden = false;

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

  function runAutoRefresh() {
    if (!autoRefreshEnabled) return;
    if (documentRef?.hidden === true || documentRef?.visibilityState === "hidden") {
      refreshDeferredWhileHidden = true;
      return;
    }
    refreshDeferredWhileHidden = false;
    // refresh() already rejects concurrent manual, package-action and timer requests.
    void refresh({ source: "auto" });
  }

  function handleVisibilityChange() {
    if (refreshDeferredWhileHidden && autoRefreshEnabled) runAutoRefresh();
  }

  function startAuto() {
    stopAuto();
    if (!autoRefreshEnabled) return;
    intervalId = timer?.setInterval?.(runAutoRefresh, refreshIntervalMs) ?? null;
    documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);
  }

  function stopAuto() {
    if (intervalId !== null) timer?.clearInterval?.(intervalId);
    intervalId = null;
    refreshDeferredWhileHidden = false;
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
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
