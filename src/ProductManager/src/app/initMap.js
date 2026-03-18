export function initMap() {
  map = createMap();
  view = createView(map);
  hoverManager = createHoverManager(view);
  window.hoverManager = hoverManager;
  refreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    addLayer: createLayer,

    onRefreshSuccess: () => {
      updateLastUpdated();
      noticeSuccess("Data refreshed");
    },

    onRefreshError: (error) => {
      noticeError(`Refresh failed: ${error.message}`);
    },
  });
}
