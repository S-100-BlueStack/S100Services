import { normalizeError } from "../../../shared/errors/normalizeError.js";
import { applyJobLayerFilters } from "../filters/applyJobLayerFilters.js";
import { applyAoiJobSummaryRenderer } from "../layers/applyAoiRenderer.js";
import { createAoiHighlightController } from "../layers/aoiHighlight.js";
import { createAoiHoverController } from "../layers/aoiHover.js";
import { applyJobLayerData } from "../layers/applyJobLayerData.js";
import { applyJobPointClustering } from "../layers/jobClustering.js";
import { createJobHighlightController } from "../layers/jobHighlight.js";
import { registerAoiPopupActions } from "../popups/aoiPopupActions.js";
import { configureAoiJobSummaryPopupContent } from "../popups/aoiPopupContent.js";
import { registerJobPopupActions } from "../popups/jobPopupActions.js";
import { createMapView } from "./createMapView.js";

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
  onJobLayerError,
  onShowRelatedJobs,
  onShowJobDetails,
} = {}) {
  let mapResult = null;
  let isDestroyed = false;
  let removeAoiPopupActions = () => {};
  let removeJobPopupActions = () => {};
  let jobHighlightController = null;
  let aoiHighlightController = null;
  let aoiHoverController = null;
  let currentJobFilters = null;
  let currentJobClusterSettings = null;
  let aoiRendererRequestId = 0;
  let jobClusterRequestId = 0;

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

      if (isDestroyed) {
        return {
          ok: false,
          error: null,
        };
      }

      jobHighlightController = createJobHighlightController({
        view: mapResult.view,
        jobLayers: mapResult.layers.jobLayers,
      });
      aoiHighlightController = createAoiHighlightController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
      });
      aoiHoverController = createAoiHoverController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
      });

      configureMapPopupContent();
      registerMapInteractionHandlers();
      applyCurrentJobClusterSettingsWithoutBlocking();
      applyCurrentJobFilters();
      applyCurrentAoiRendererWithoutBlockingMapReady();
      applyJobGeometryWithoutBlockingMapReady(mapResult.layers.jobLayers);
      setReadyStatus(Boolean(mapResult.layers.aoiLayer));

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
    removeAoiPopupActions();
    removeJobPopupActions();
    removeAoiPopupActions = () => {};
    removeJobPopupActions = () => {};
    aoiHoverController?.destroy();
    jobHighlightController?.destroy();
    aoiHighlightController?.destroy();
    aoiHoverController = null;
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
    return jobHighlightController?.highlightJob(selectedJob) ?? Promise.resolve();
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
      clearAoiHighlight();

      return Promise.resolve();
    }

    return aoiHighlightController?.highlightAoisByIds([normalizedAoiId]) ?? Promise.resolve();
  }

  function clearAoiHighlight() {
    aoiHighlightController?.clearHighlight();
  }

  function applyJobClusterSettings(settings) {
    currentJobClusterSettings = settings;

    applyCurrentJobClusterSettingsWithoutBlocking();
  }

  function applyCurrentJobClusterSettingsWithoutBlocking() {
    if (!mapResult?.layers?.jobLayers) {
      return;
    }

    const clusterRequestId = jobClusterRequestId + 1;
    jobClusterRequestId = clusterRequestId;

    void applyJobPointClustering({
      jobLayers: mapResult.layers.jobLayers,
      settings: currentJobClusterSettings,
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

    applyJobLayerFilters({
      jobLayers: mapResult.layers.jobLayers,
      filters: currentJobFilters,
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

  function normalizeOptionalString(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  function setReadyStatus(hasAoiLayer) {
    if (hasAoiLayer) {
      setStatus({
        status: MAP_STATUS.READY,
        title: "Map ready",
        message: "",
        hidden: true,
      });

      return;
    }

    setStatus({
      status: MAP_STATUS.WARNING,
      title: "Map ready",
      message: "AOI Feature Service URL is not configured yet.",
    });
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
    applyJobFilters,
    applyJobClusterSettings,
  };
}
