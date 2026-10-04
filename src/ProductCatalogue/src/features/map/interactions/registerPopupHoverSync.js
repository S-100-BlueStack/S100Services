import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

export function registerPopupHoverSync(view, hoverManager) {
  if (!view) {
    throw new Error("registerPopupHoverSync requires a view instance.");
  }

  if (!hoverManager) {
    throw new Error("registerPopupHoverSync requires a hoverManager instance.");
  }

  let popupSyncHandle = null;

  function syncPopupState() {
    const isVisible = view.popup?.visible;
    const feature = view.popup?.selectedFeature;

    if (!isVisible || !feature) {
      hoverManager.clearLockedFeature();
      return;
    }

    hoverManager.setLockedFeature(feature);
  }

  const initHandle = reactiveUtils.when(
    () => view.popup?.viewModel,
    () => {
      popupSyncHandle = reactiveUtils.watch(
        () => [view.popup.visible, view.popup.selectedFeature],
        () => {
          syncPopupState();
        }
      );

      // Important: the watch callback does not run immediately by default.
      // Without an initial sync, an already open popup can be missed.
      syncPopupState();
    },
    { once: true }
  );

  return () => {
    popupSyncHandle?.remove();
    initHandle?.remove();
  };
}
