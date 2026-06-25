import { normalizeError } from "../../../shared/errors/normalizeError.js";
import { validateAoiFeatureLayer } from "../../aoi/services/aoiService.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { applyJobLayerFilters } from "../filters/applyJobLayerFilters.js";
import { applyAoiJobSummaryRenderer } from "../layers/applyAoiRenderer.js";
import { createAoiHighlightController } from "../layers/aoiHighlight.js";
import { applyJobLayerData } from "../layers/applyJobLayerData.js";
import { applyJobPointClustering } from "../layers/jobClustering.js";
import { createJobHighlightController } from "../layers/jobHighlight.js";
import { createMapHoverController } from "../layers/mapHover.js";
import { registerAoiPopupActions } from "../popups/aoiPopupActions.js";
import { configureAoiJobSummaryPopupContent } from "../popups/aoiPopupContent.js";
import { registerJobPopupActions } from "../popups/jobPopupActions.js";
import { createMapView } from "./createMapView.js";
import { refreshAoiLayerPopupTemplate } from "../layers/createAoiLayer.js";

const MAP_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  WARNING: "warning",
  ERROR: "error",
});

export function createMapController({
  container,
  statusElement,
  runtimeConfig,
  onError,
  onAoiLayerError,
  onJobLayerError,
  onShowRelatedJobs,
  onShowJobDetails,
  relationService = defaultRelationService,
} = {}) {
  let mapResult = null;
  let isDestroyed = false;
  let removeAoiPopupActions = () => {};
  let removeJobPopupActions = () => {};
  let jobHighlightController = null;
  let aoiHighlightController = null;
  let mapHoverController = null;
  let currentJobFilters = null;
  let currentJobClusterSettings = null;
  let currentScopedJobIds = null;
  let aoiRendererRequestId = 0;
  let jobClusterRequestId = 0;
  let aoiJobScopeRequestId = 0;

  async function start() {
    setStatus({
      status: MAP_STATUS.LOADING,
      title: "Loading map...",
      message: "Preparing the ArcGIS workspace.",
    });

    try {
      mapResult = createMapView({
        container,
        runtimeConfig,
      });

      await mapResult.view.when();

      const aoiReadinessResult = await validateCurrentAoiLayer();

      if (isDestroyed) {
        return {
          ok: false,
          error: null,
        };
      }

      if (!aoiReadinessResult.ok) {
        disableAoiLayerAfterLoadFailure();
        onAoiLayerError?.(aoiReadinessResult.error);
      } else {
        refreshLoadedAoiPopupTemplate(aoiReadinessResult);
      }

      jobHighlightController = createJobHighlightController({
        view: mapResult.view,
        jobLayers: mapResult.layers.jobLayers,
      });
      aoiHighlightController = createAoiHighlightController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
      });
      mapHoverController = createMapHoverController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
        jobLayers: mapResult.layers.jobLayers,
      });

      configureMapPopupContent();
      registerMapInteractionHandlers();
      applyCurrentJobClusterSettingsWithoutBlocking();
      applyCurrentJobFilters();
      applyCurrentAoiRendererWithoutBlockingMapReady();
      applyJobGeometryWithoutBlockingMapReady(mapResult.layers.jobLayers);
      setReadyStatus(aoiReadinessResult);

      return {
        ok: true,
        data: mapResult,
      };
    } catch (error) {
      const normalizedError = normalizeError(error, "Map could not be loaded.");

      setStatus({
        status: MAP_STATUS.ERROR,
        title: "Map could not be loaded",
        message: normalizedError.message,
      });
      onError?.(normalizedError);

      return {
        ok: false,
        error: normalizedError,
      };
    }
  }

  function destroy() {
    isDestroyed = true;
    aoiRendererRequestId += 1;
    jobClusterRequestId += 1;
    aoiJobScopeRequestId += 1;
    removeAoiPopupActions();
    removeJobPopupActions();
    removeAoiPopupActions = () => {};
    removeJobPopupActions = () => {};
    mapHoverController?.destroy();
    jobHighlightController?.destroy();
    aoiHighlightController?.destroy();
    mapHoverController = null;
    jobHighlightController = null;
    aoiHighlightController = null;
    mapResult?.view?.destroy();
    mapResult = null;
  }

  function getView() {
    return mapResult?.view ?? null;
  }

  function getMap() {
    return mapResult?.map ?? null;
  }

  function highlightJob(selectedJob) {
    return clearHoverAfterSelection(
      jobHighlightController?.highlightJob(selectedJob) ?? Promise.resolve()
    );
  }

  function clearJobHighlight() {
    jobHighlightController?.clearHighlight();
  }

  function highlightRelatedAoisForJob(selectedJob = {}) {
    return (
      aoiHighlightController?.highlightAoisByIds(selectedJob.relatedAoiIds) ?? Promise.resolve()
    );
  }

  function highlightAoiById(aoiId) {
    const normalizedAoiId = normalizeOptionalString(aoiId);

    if (!normalizedAoiId) {
      mapHoverController?.clearHover();
      clearAoiHighlight();

      return Promise.resolve();
    }

    return clearHoverAfterSelection(
      aoiHighlightController?.highlightAoisByIds([normalizedAoiId]) ?? Promise.resolve()
    );
  }

  function clearAoiHighlight() {
    aoiHighlightController?.clearHighlight();
  }

  async function applyAoiJobScope(selectedAoi = {}) {
    const normalizedAoiId = normalizeOptionalString(selectedAoi.aoiId ?? selectedAoi.id);
    const scopeRequestId = aoiJobScopeRequestId + 1;
    aoiJobScopeRequestId = scopeRequestId;

    if (!normalizedAoiId) {
      clearAoiJobScope();

      return {
        ok: true,
        data: {
          jobIds: [],
        },
      };
    }

    if (!relationService?.loadJobIdsForAoi) {
      currentScopedJobIds = [];
      applyCurrentJobFilters();

      throw new Error("Relation service is not available.");
    }

    const result = await relationService.loadJobIdsForAoi({
      aoiId: normalizedAoiId,
    });

    if (isDestroyed || scopeRequestId !== aoiJobScopeRequestId) {
      return result;
    }

    if (!result.ok) {
      // Avoid leaving a previous AOI scope active when the new scope cannot be resolved.
      currentScopedJobIds = [];
      applyCurrentJobFilters();

      return result;
    }

    currentScopedJobIds = normalizeJobIds(result.data.jobIds);
    applyCurrentJobFilters();

    return {
      ...result,
      data: {
        ...result.data,
        jobIds: [...currentScopedJobIds],
      },
    };
  }

  function clearAoiJobScope() {
    aoiJobScopeRequestId += 1;
    currentScopedJobIds = null;
    applyCurrentJobFilters();
  }

  async function refreshJobData({ jobs } = {}) {
    if (!mapResult?.layers?.jobLayers) {
      return {
        ok: true,
        data: {
          pointCount: 0,
          polygonCount: 0,
        },
      };
    }

    mapHoverController?.clearHover();
    closeOpenAggregatePopup();

    try {
      const result = await applyJobLayerData({
        jobLayers: mapResult.layers.jobLayers,
        jobs,
      });

      if (isDestroyed || !result.ok) {
        return result;
      }

      applyCurrentJobFilters();
      applyCurrentJobClusterSettingsWithoutBlocking();
      applyCurrentAoiRendererWithoutBlockingMapReady();

      return result;
    } catch (error) {
      return {
        ok: false,
        error: normalizeError(error, "Job map data could not be refreshed."),
      };
    }
  }

  function applyJobClusterSettings(settings) {
    currentJobClusterSettings = settings;

    applyCurrentJobClusterSettingsWithoutBlocking();
  }

  function applyCurrentJobClusterSettingsWithoutBlocking() {
    if (!mapResult?.layers?.jobLayers) {
      return;
    }

    closeOpenAggregatePopup();

    const clusterRequestId = jobClusterRequestId + 1;
    jobClusterRequestId = clusterRequestId;

    void applyJobPointClustering({
      jobLayers: mapResult.layers.jobLayers,
      settings: currentJobClusterSettings,
      view: mapResult.view,
      onShowJobDetails,
      shouldApply() {
        return !isDestroyed && clusterRequestId === jobClusterRequestId;
      },
    }).catch(() => {
      if (!isDestroyed && clusterRequestId === jobClusterRequestId) {
        void applyJobPointClustering({
          jobLayers: mapResult.layers.jobLayers,
          settings: {
            ...currentJobClusterSettings,
            style: "count",
          },
          view: mapResult.view,
          onShowJobDetails,
        });
      }
    });
  }

  function applyJobFilters(filters) {
    currentJobFilters = filters;

    applyCurrentJobFilters();
    applyCurrentAoiRendererWithoutBlockingMapReady();
  }

  function applyCurrentJobFilters() {
    if (!mapResult?.layers?.jobLayers) {
      return;
    }

    closeOpenAggregatePopup();

    applyJobLayerFilters({
      jobLayers: mapResult.layers.jobLayers,
      filters: currentJobFilters,
      scopedJobIds: currentScopedJobIds,
    });
  }

  function applyCurrentAoiRendererWithoutBlockingMapReady() {
    if (!mapResult?.layers?.aoiLayer) {
      return;
    }

    applyAoiRendererWithoutBlockingMapReady(mapResult.layers.aoiLayer);
  }

  function configureMapPopupContent() {
    if (!mapResult?.layers?.aoiLayer) {
      return;
    }

    configureAoiJobSummaryPopupContent({
      aoiLayer: mapResult.layers.aoiLayer,
      getJobFilters() {
        return currentJobFilters;
      },
    });
  }

  function registerMapInteractionHandlers() {
    if (mapResult?.layers?.aoiLayer) {
      removeAoiPopupActions = registerAoiPopupActions({
        view: mapResult.view,
        onShowRelatedJobs,
      });
    }

    if (mapResult?.layers?.jobLayers) {
      removeJobPopupActions = registerJobPopupActions({
        view: mapResult.view,
        onShowJobDetails,
      });
    }
  }

  function applyAoiRendererWithoutBlockingMapReady(aoiLayer) {
    const rendererRequestId = aoiRendererRequestId + 1;
    aoiRendererRequestId = rendererRequestId;

    void applyAoiJobSummaryRenderer({
      aoiLayer,
      jobFilters: currentJobFilters,
      shouldApply() {
        return !isDestroyed && rendererRequestId === aoiRendererRequestId;
      },
    }).catch(() => {
      if (!isDestroyed && rendererRequestId === aoiRendererRequestId) {
        // Keep the map usable if the mock relation source fails while the renderer is being enriched.
        aoiLayer?.set?.("renderer", aoiLayer.renderer);
      }
    });
  }

  function applyJobGeometryWithoutBlockingMapReady(jobLayers) {
    void applyJobLayerData({ jobLayers })
      .then((result) => {
        if (!result.ok) {
          onJobLayerError?.(result.error);
        }
      })
      .catch((error) => {
        onJobLayerError?.(normalizeError(error, "Job geometry could not be loaded."));
      });
  }

  async function validateCurrentAoiLayer() {
    return validateAoiFeatureLayer({
      aoiLayer: mapResult?.layers?.aoiLayer,
    });
  }

  function disableAoiLayerAfterLoadFailure() {
    const aoiLayer = mapResult?.layers?.aoiLayer;

    if (!aoiLayer) {
      return;
    }

    mapResult.map?.remove?.(aoiLayer);
    mapResult.layers.aoiLayer = null;
  }

  function refreshLoadedAoiPopupTemplate(aoiReadinessResult) {
    const availableFieldNames = aoiReadinessResult.data?.fieldReport?.availableFieldNames;

    if (!availableFieldNames) {
      return;
    }

    refreshAoiLayerPopupTemplate({
      aoiLayer: mapResult?.layers?.aoiLayer,
      availableFieldNames,
    });
  }

  function clearHoverAfterSelection(selectionPromise) {
    return Promise.resolve(selectionPromise).finally(() => {
      if (!isDestroyed) {
        mapHoverController?.clearHover();
      }
    });
  }

  function closeOpenAggregatePopup() {
    const view = mapResult?.view;
    const popup = view?.popup;

    if (!view || !popup || !hasOpenAggregatePopupFeature(popup)) {
      return;
    }

    if (typeof view.closePopup === "function") {
      view.closePopup();
      return;
    }

    popup.close?.();
  }

  function hasOpenAggregatePopupFeature(popup) {
    if (popup.selectedFeature?.isAggregate) {
      return true;
    }

    return getPopupFeatures(popup).some((feature) => feature?.isAggregate);
  }

  function getPopupFeatures(popup) {
    const features = popup.features;

    if (!features) {
      return [];
    }

    if (Array.isArray(features)) {
      return features;
    }

    if (typeof features.toArray === "function") {
      return features.toArray();
    }

    return [];
  }

  function normalizeJobIds(jobIds) {
    if (!Array.isArray(jobIds)) {
      return [];
    }

    return [...new Set(jobIds.map(normalizeOptionalString).filter(Boolean))];
  }

  function normalizeOptionalString(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  function setReadyStatus(aoiReadinessResult) {
    if (!aoiReadinessResult?.ok) {
      setStatus({
        status: MAP_STATUS.WARNING,
        title: "Map ready without AOIs",
        message: aoiReadinessResult?.error?.message || "AOIs could not be loaded.",
      });

      return;
    }

    const readiness = aoiReadinessResult.data;

    if (readiness.status === "missing-config") {
      setStatus({
        status: MAP_STATUS.WARNING,
        title: "Map ready",
        message: "AOI Feature Service URL is not configured yet.",
      });

      return;
    }

    if (readiness.status === "warning") {
      setStatus({
        status: MAP_STATUS.WARNING,
        title: "Map ready with AOI warnings",
        message: createAoiReadinessWarningMessage(readiness),
      });

      return;
    }

    setStatus({
      status: MAP_STATUS.READY,
      title: "Map ready",
      message: "",
      hidden: true,
    });
  }

  function createAoiReadinessWarningMessage(readiness) {
    const warnings = Array.isArray(readiness?.warnings) ? readiness.warnings.filter(Boolean) : [];

    return warnings[0] || "AOI Feature Service loaded, but its fields should be reviewed.";
  }

  function setStatus({ status, title, message, hidden = false }) {
    if (!statusElement) {
      return;
    }

    statusElement.hidden = hidden;
    statusElement.dataset.status = status;

    const titleElement = document.createElement("p");
    titleElement.className = "job-manager-map-status__title";
    titleElement.textContent = title;

    const messageElement = document.createElement("p");
    messageElement.className = "job-manager-map-status__message";
    messageElement.textContent = message;

    statusElement.replaceChildren(titleElement, messageElement);
  }

  return {
    start,
    destroy,
    getView,
    getMap,
    highlightJob,
    clearJobHighlight,
    highlightRelatedAoisForJob,
    highlightAoiById,
    clearAoiHighlight,
    applyAoiJobScope,
    clearAoiJobScope,
    refreshJobData,
    applyJobFilters,
    applyJobClusterSettings,
  };
}
