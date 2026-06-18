import { normalizeError } from "../../../shared/errors/normalizeError.js";
import { applyAoiJobSummaryRenderer } from "../layers/applyAoiRenderer.js";
import { createMapView } from "./createMapView.js";

const MAP_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  WARNING: "warning",
  ERROR: "error",
});

export function createMapController({ container, statusElement, runtimeConfig, onError } = {}) {
  let mapResult = null;
  let isDestroyed = false;

  async function start() {
    setStatus({
      status: MAP_STATUS.LOADING,
      title: "Loading map...",
      message: "Preparing the ArcGIS workspace.",
    });

    try {
      mapResult = createMapView({ container, runtimeConfig });
      await mapResult.view.when();

      if (isDestroyed) {
        return { ok: false, error: null };
      }

      applyAoiRendererWithoutBlockingMapReady(mapResult.layers.aoiLayer);
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
    mapResult?.view?.destroy();
    mapResult = null;
  }

  function getView() {
    return mapResult?.view ?? null;
  }

  function getMap() {
    return mapResult?.map ?? null;
  }

  function applyAoiRendererWithoutBlockingMapReady(aoiLayer) {
    void applyAoiJobSummaryRenderer({ aoiLayer }).catch(() => {
      // Keep the map usable if the mock relation source fails while the renderer is being enriched.
      aoiLayer?.set?.("renderer", aoiLayer.renderer);
    });
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
  };
}
