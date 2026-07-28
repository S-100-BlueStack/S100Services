import { findFeature } from "../core/featureAdapter.js";
import { getAllLayers, getLayer } from "../core/layerRegistry.js";
import { reconcileGraphicsLayers } from "../core/reconcileGraphicsLayers.js";
import { rebuildLayers } from "../core/rebuildLayers.js";
import { refreshOpenProductPopup } from "../popups/popupRefreshBridge.js";
import { runWithRetry } from "../../../shared/utils/retryRunner.js";

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
  onRefreshStart,
  onRefreshSuccess,
  onRefreshError,
  onRefreshSkipped,
}) {
  let isRefreshing = false;
  let autoRefreshEnabled = true;
  let intervalId = null;

  function captureState() {
    const selectedFeature = view.popup.selectedFeature;
    const popupLocation = cloneGeometry(view.popup.location);

    return {
      selectedFeatureKey: selectedFeature?.attributes?.featureKey,
      selectedDatasetName: readDatasetName(selectedFeature?.attributes),
      selectedLayerId: selectedFeature?.layer?.customId,
      popupVisible: view.popup.visible,
      popupLocation,
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

  function synchronizeReconciledState(state) {
    if (!state) {
      return;
    }

    if (state.popupVisible && state.selectedFeatureKey && state.selectedLayerId) {
      const graphic = findFeatureForRestore(state.selectedLayerId, state.selectedFeatureKey);

      if (!graphic || graphic.visible === false) {
        view.popup.close();
      } else if (view.popup.selectedFeature !== graphic) {
        // Matching graphics normally retain object identity during reconciliation.
        // Reopen only as a defensive fallback if an external ArcGIS lifecycle
        // replaced the selected feature reference.
        view.popup.open({
          features: [graphic],
          location: state.popupLocation ?? getPopupLocation(graphic),
        });
      }
    }

    if (state.lockedFeatureKey && state.lockedLayerId) {
      const graphic = findFeatureForRestore(state.lockedLayerId, state.lockedFeatureKey);

      if (!graphic || graphic.visible === false) {
        hoverManager.clearLockedFeature?.();
      }
    }
  }

  function findFeatureForRestore(layerId, featureKey) {
    const preferredLayer = getLayer(layerId);
    const preferredGraphic = findFeature(preferredLayer, featureKey);

    if (preferredGraphic) {
      return preferredGraphic;
    }

    // Layer ids can change later when multiple product layers are introduced.
    // Falling back to all registered layers keeps popup restore resilient.
    for (const layer of getAllLayers()) {
      const graphic = findFeature(layer, featureKey);

      if (graphic) {
        return graphic;
      }
    }

    return null;
  }

  async function refresh({ source = "manual" } = {}) {
    if (isRefreshing) {
      const skippedResult = {
        success: false,
        skipped: true,
        reason: "already-refreshing",
        source,
      };

      onRefreshSkipped?.(skippedResult);
      return skippedResult;
    }

    isRefreshing = true;

    const startedAt = new Date();

    try {
      const state = captureState();

      onRefreshStart?.({
        source,
        startedAt,
      });

      const result = await runWithRetry(loadAppData, {
        maxRetries: source === "manual" ? MANUAL_REFRESH_MAX_RETRIES : AUTO_REFRESH_MAX_RETRIES,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
      });

      const layerConfigs = normalizeLayers(result);
      const reconciliation = await tryReconcileLayers(layerConfigs);

      let activeLayers;
      let refreshStrategy;
      let reconciliationReason = null;

      if (reconciliation.success) {
        activeLayers = reconciliation.layers;
        refreshStrategy = "reconciled";

        await onLayersRebuilt?.(activeLayers);
        synchronizeReconciledState(state);

        if (state.popupVisible && state.selectedDatasetName && view.popup.visible) {
          await refreshOpenProductPopup(state.selectedDatasetName, {
            showFailureNotice: false,
          });
        }
      } else {
        reconciliationReason = reconciliation.reason;
        refreshStrategy = "rebuilt";
        activeLayers = await rebuildLayers({
          map,
          hoverManager,
          layerConfigs,
          createLayer,
        });

        await onLayersRebuilt?.(activeLayers);
        await restoreState(state);
      }

      const finishedAt = new Date();
      const graphicsCount = getTotalGraphics(activeLayers);

      const refreshResult = {
        success: true,
        skipped: false,
        source,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        layerCount: activeLayers.length,
        graphicsCount,
        strategy: refreshStrategy,
        reconciliationReason,
      };

      onRefreshSuccess?.(refreshResult);
      return refreshResult;
    } catch (error) {
      const finishedAt = new Date();

      const refreshResult = {
        success: false,
        skipped: false,
        source,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error,
      };

      onRefreshError?.(error, refreshResult);
      return refreshResult;
    } finally {
      isRefreshing = false;
    }
  }

  async function tryReconcileLayers(layerConfigs) {
    const currentLayers = getAllLayers();

    if (currentLayers.length === 0) {
      return createReconciliationFailure("no-current-layers");
    }

    const candidateLayers = [];
    const stagingMap = {
      add() {},
    };

    try {
      for (const layerConfig of layerConfigs) {
        const candidateLayer = await createLayer(stagingMap, layerConfig);

        if (candidateLayer) {
          candidateLayers.push(candidateLayer);
        }
      }

      return reconcileGraphicsLayers({
        currentLayers,
        candidateLayers,
      });
    } catch (error) {
      console.warn("[Refresh] In-place reconciliation unavailable; using full rebuild.", error);
      return createReconciliationFailure("candidate-layer-creation-failed");
    } finally {
      destroyCandidateLayers(candidateLayers);
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
    if (intervalId === null) {
      return;
    }

    window.clearInterval(intervalId);
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

  function isAutoEnabled() {
    return autoRefreshEnabled;
  }

  function isRefreshInProgress() {
    return isRefreshing;
  }

  return {
    refresh,
    setAuto,
    startAuto,
    stopAuto,
    isAutoEnabled,
    isRefreshInProgress,
  };
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

function cloneGeometry(geometry) {
  return geometry?.clone?.() ?? geometry ?? null;
}

function readDatasetName(attributes) {
  return attributes?.datasetName ?? attributes?.DatasetName ?? attributes?.datasetname ?? null;
}

function destroyCandidateLayers(layers) {
  for (const layer of layers) {
    try {
      layer.removeAll?.();
      layer.destroy?.();
    } catch (error) {
      console.debug("[Refresh] Candidate layer cleanup failed.", error);
    }
  }
}

function createReconciliationFailure(reason) {
  return {
    success: false,
    strategy: "rebuild-required",
    reason,
  };
}
