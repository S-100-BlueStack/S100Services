import { findFeature } from "../../map/core/featureAdapter.js";
import { getAllLayers, getLayer } from "../../map/core/layerRegistry.js";
import { rebuildLayers } from "../../map/core/rebuildLayers.js";
import { bindDisplayScaleVisibility } from "../../map/scale/displayScaleVisibility.js";
let isRefreshing = false;
let autoRefreshEnabled = true;
let intervalId = null;

const REFRESH_INTERVAL = 10 * 60 * 1000;

export function createRefreshService({
  map,
  view,
  hoverManager,
  loadAppData,
  addLayer,
  onRefreshSuccess,
  onRefreshError,
}) {
  function captureState() {
    const selectedFeature = view.popup.selectedFeature;

    return {
      selectedFeatureKey: selectedFeature?.attributes?.featureKey,
      selectedLayerId: selectedFeature?.layer?.customId,
      popupVisible: view.popup.visible,
      lockedFeatureKey: hoverManager?.getLockedFeatureKey?.(),
      lockedLayerId: hoverManager?.getLockedLayerId?.(),
    };
  }

  async function restoreState(state) {
    if (!state) {
      return;
    }

    if (state.popupVisible && state.selectedFeatureKey && state.selectedLayerId) {
      const graphic = findFeatureForRestore(state.selectedLayerId, state.selectedFeatureKey);

      if (graphic) {
        openPopup(view, {
          features: [graphic],
          location: getPopupLocation(graphic),
        });
      }
    }

    if (state.lockedFeatureKey && state.lockedLayerId) {
      const graphic = findFeatureForRestore(state.lockedLayerId, state.lockedFeatureKey);

      if (graphic) {
        hoverManager.setLockedFeature(graphic);
      }
    }
  }

  function findFeatureForRestore(layerId, featureKey) {
    const preferredLayer = getLayer(layerId);
    const preferredGraphic = findFeature(preferredLayer, featureKey);

    if (preferredGraphic) {
      return preferredGraphic;
    }

    // If the user crossed a scale boundary during refresh, the previous
    // overview/detail layer may no longer be the best layer to restore from.
    for (const layer of getAllLayers()) {
      const graphic = findFeature(layer, featureKey);

      if (graphic) {
        return graphic;
      }
    }

    return null;
  }

  function getPopupLocation(graphic) {
    const geom = graphic.geometry;

    if (!geom) {
      return null;
    }

    if (geom.type === "point") {
      return geom;
    }

    if (geom.extent) {
      return geom.extent.center;
    }

    return null;
  }

  async function refresh() {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;

    const state = captureState();

    try {
      const data = await loadAppData();

      const createdLayers = await rebuildLayers({
        map,
        view,
        hoverManager,
        layerConfigs: data.layers,
        createLayer: addLayer,
      });

      bindDisplayScaleVisibility(view, {
        layers: createdLayers,
      });

      await restoreState(state);
      onRefreshSuccess?.();
    } catch (error) {
      onRefreshError?.(error);
    } finally {
      isRefreshing = false;
    }
  }

  function startAuto() {
    stopAuto();

    intervalId = setInterval(() => {
      if (autoRefreshEnabled) {
        refresh();
      }
    }, REFRESH_INTERVAL);
  }

  function stopAuto() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function setAuto(enabled) {
    autoRefreshEnabled = enabled;

    if (enabled) {
      startAuto();
    } else {
      stopAuto();
    }
  }

  return {
    refresh,
    setAuto,
    startAuto,
    stopAuto,
  };
}

function openPopup(view, options) {
  if (typeof view.openPopup === "function") {
    view.openPopup(options);
    return;
  }

  view.popup.open(options);
}
