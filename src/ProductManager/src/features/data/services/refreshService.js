import { findFeature } from "../../map/core/featureAdapter.js";
import { getAllLayers, getLayer } from "../../map/core/layerRegistry.js";
import { rebuildLayers } from "../../map/core/rebuildLayers.js";
import { createLoaderProgressSession } from "../../../shared/ui/loaderProgressSession.js";
import { runWithRetry } from "../../../shared/utils/retryRunner.js";

let isRefreshing = false;
let autoRefreshEnabled = true;
let intervalId = null;

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MANUAL_REFRESH_MAX_RETRIES = 5;
const AUTO_REFRESH_MAX_RETRIES = 1;

export function createRefreshService({
  map,
  view,
  hoverManager,
  loadAppData,
  createLayer,
  onLayersRebuilt,
  onRefreshSuccess,
  onRefreshError,
}) {
  function captureState() {
    const selectedFeature = view.popup.selectedFeature;
    const popupLocation = cloneGeometry(view.popup.location);

    return {
      selectedFeatureKey: selectedFeature?.attributes?.featureKey,
      selectedLayerId: selectedFeature?.layer?.customId,
      popupVisible: view.popup.visible,
      popupLocation,
      lockedFeatureKey: hoverManager?.getLockedFeatureKey?.(),
      lockedLayerId: hoverManager?.getLockedLayerId?.(),
    };
  }
  function cloneGeometry(geometry) {
    return geometry?.clone?.() ?? geometry ?? null;
  }

  async function restoreState(state) {
    if (!state) {
      return;
    }

    if (state.popupVisible && state.selectedFeatureKey && state.selectedLayerId) {
      const graphic = findFeatureForRestore(state.selectedLayerId, state.selectedFeatureKey);

      if (graphic && graphic.visible !== false) {
        view.popup.open({
          features: [graphic],
          location: state.popupLocation ?? getPopupLocation(graphic),
        });
      }
    }

    if (state.lockedFeatureKey && state.lockedLayerId) {
      const graphic = findFeatureForRestore(state.lockedLayerId, state.lockedFeatureKey);

      if (graphic && graphic.visible !== false) {
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

    // Fall back to all registered layers so state restoration still works if
    // layer ids change later when more product layers are introduced.
    for (const layer of getAllLayers()) {
      const graphic = findFeature(layer, featureKey);

      if (graphic) {
        return graphic;
      }
    }

    return null;
  }

  function getPopupLocation(graphic) {
    const geometry = graphic.geometry;

    if (!geometry) {
      return null;
    }

    if (geometry.type === "point") {
      return geometry;
    }

    if (geometry.extent) {
      return geometry.extent.center;
    }

    return null;
  }

  async function refresh({ source = "manual" } = {}) {
    if (isRefreshing) {
      return {
        success: false,
        skipped: true,
        reason: "already-refreshing",
      };
    }

    isRefreshing = true;

    const state = captureState();

    try {
      const result = await runWithRetry(loadAppData, {
        maxRetries: source === "manual" ? MANUAL_REFRESH_MAX_RETRIES : AUTO_REFRESH_MAX_RETRIES,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
      });

      const layers = normalizeLayers(result);

      const createdLayers = await rebuildLayers({
        map,
        hoverManager,
        layerConfigs: layers,
        createLayer,
      });

      await onLayersRebuilt?.(createdLayers);
      await restoreState(state);

      const graphicsCount = getTotalGraphics(createdLayers);

      onRefreshSuccess?.({
        source,
        layerCount: createdLayers.length,
        graphicsCount,
      });

      return {
        success: true,
        skipped: false,
        source,
        layerCount: createdLayers.length,
        graphicsCount,
      };
    } catch (error) {
      onRefreshError?.(error, {
        source,
      });

      return {
        success: false,
        skipped: false,
        source,
        error,
      };
    } finally {
      isRefreshing = false;
    }
  }

  function startAuto() {
    stopAuto();

    intervalId = window.setInterval(() => {
      if (autoRefreshEnabled) {
        void refresh({ source: "auto" });
      }
    }, REFRESH_INTERVAL_MS);
  }

  function stopAuto() {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function setAuto(enabled) {
    autoRefreshEnabled = Boolean(enabled);

    if (autoRefreshEnabled) {
      startAuto();
    } else {
      stopAuto();
    }
  }

  function isAutoEnabled() {
    return autoRefreshEnabled;
  }

  return {
    refresh,
    setAuto,
    startAuto,
    stopAuto,
    isAutoEnabled,
  };
}

function createRefreshLoaderProgress() {
  return createLoaderProgressSession({
    loadStartProgress: 0.04,
    loadEndProgress: 0.18,
    dataReceivedProgress: 0.2,
    renderStartProgress: 0.24,
    renderEndProgress: 0.96,
    simulatedProgressIntervalMs: 350,
    simulatedProgressStep: 0.014,
    showLoaderOnStart: true,
    showLoaderDelayMs: 350,
  });
}

function normalizeLayers(result) {
  if (!result || !Array.isArray(result.layers)) {
    throw new Error("Data loader returned an invalid result. Expected { layers: [] }.");
  }

  const layers = result.layers.filter(Boolean);

  if (layers.length === 0) {
    throw new Error("No layers were returned from the data loader.");
  }

  return layers;
}

function getTotalGraphics(layers) {
  return layers.reduce((sum, layer) => {
    return sum + (layer.graphics?.length ?? 0);
  }, 0);
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
