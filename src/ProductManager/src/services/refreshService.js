import { findFeature } from "../map/featureAdapter";
import { getLayer } from "../map/layerRegistry";
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
  let geoJsonLayers = [];

  function captureState() {
    const selectedFeature = view.popup.selectedFeature;

    return {
      selectedFeatureId: selectedFeature?.attributes?.id,
      selectedLayerId: selectedFeature?.layer?.customId,

      popupVisible: view.popup.visible,

      lockedFeatureId: hoverManager?.getLockedFeatureId?.(),
      lockedLayerId: hoverManager?.getLockedLayerId?.(),
    };
  }

  async function restoreState(state) {
    if (!geoJsonLayers.length) return;

    // --- Popup ---
    if (state?.popupVisible && state.selectedFeatureId) {
      const layer = getLayer(state.selectedLayerId);

      const graphic = findFeature(layer, state.selectedFeatureId);

      if (graphic) {
        view.popup.open({
          features: [graphic],
          location: getPopupLocation(graphic),
        });
      }
    }

    // --- Highlight ---
    if (state?.lockedFeatureId) {
      const layer = getLayer(state.lockedLayerId);

      const graphic = findFeature(layer, state.lockedFeatureId);

      if (graphic) {
        hoverManager.setLockedFeature(graphic);
      }
    }
  }
  function getPopupLocation(graphic) {
    const geom = graphic.geometry;

    if (!geom) return null;

    if (geom.type === "point") {
      return geom;
    }

    if (geom.extent) {
      return geom.extent.center;
    }

    return null;
  }
  async function refresh() {
    if (isRefreshing) return;

    isRefreshing = true;

    const state = captureState();

    try {
      const data = await loadAppData();

      // Fjern alle gamle layers
      geoJsonLayers.forEach((layer) => map.remove(layer));
      geoJsonLayers = [];

      geoJsonLayers = data.layers.map((layerConfig) => {
        const layer = addLayer(map, layerConfig);
        layer.customId = layerConfig.id;
        return layer;
      });

      // Registrer hover
      geoJsonLayers.forEach((layer) => {
        hoverManager.registerLayer(layer);
        view.whenLayerView(layer);
      });

      await Promise.all(geoJsonLayers.map((layer) => view.whenLayerView(layer)));

      hoverManager.clearLockedFeature();

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
