export function createPackagePopupFreshness({ datasetName, refresh, createFreshnessMonitor }) {
  let disposed = false;
  let initialization = null;
  let inFlightRead = null;
  const read = () => {
    if (disposed) return Promise.resolve(false);
    if (inFlightRead) return inFlightRead;
    inFlightRead = Promise.resolve()
      .then(() => (disposed ? false : refresh({ showFailureNotice: false })))
      .then((accepted) => !disposed && accepted === true)
      .catch((error) => {
        if (!disposed) console.warn("[Package popup freshness] Detail refresh failed", error);
        return false;
      })
      .finally(() => {
        inFlightRead = null;
      });
    return inFlightRead;
  };
  const monitor = createFreshnessMonitor({
    getDatasetNames: () => [datasetName],
    onChanged: read,
  });
  return {
    start() {
      if (initialization || disposed) return initialization;
      initialization = (async () => {
        // The baseline precedes detail so the following check detects changes
        // racing that read. Failed detail must remain eligible for recovery.
        await monitor.prime();
        if (disposed) return;
        if (!(await read())) monitor.requireRefresh();
        if (disposed) return;
        await monitor.check();
        if (!disposed) monitor.start();
      })();
      return initialization;
    },
    destroy() {
      disposed = true;
      monitor.destroy();
    },
  };
}

export function createPackagePopupBackendSynchronization({
  datasetName,
  refresh,
  createFreshnessMonitor,
  registerPopupRefreshHandler,
  syncFromGraphic,
}) {
  const freshness = createPackagePopupFreshness({ datasetName, refresh, createFreshnessMonitor });
  const unregister =
    typeof registerPopupRefreshHandler === "function" && typeof syncFromGraphic === "function"
      ? registerPopupRefreshHandler({ datasetName, refresh: syncFromGraphic })
      : null;
  return {
    enabled: true,
    stopWatchingActiveJobs: null,
    stopRefreshingPopup: () => {
      unregister?.();
      freshness.destroy();
    },
    start: freshness.start,
  };
}
