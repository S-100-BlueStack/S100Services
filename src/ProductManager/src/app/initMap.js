import { loadAppData } from "../features/data/services/dataLoader.js";
import { createRefreshService } from "../features/data/services/refreshService.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { createMap } from "../features/map/core/createMap.js";
import { createView } from "../features/map/core/createView.js";
import { createLayer } from "../features/map/core/layerFactory.js";
import { createHoverManager } from "../features/map/interactions/hoverManager.js";
import { registerPopupHoverSync } from "../features/map/interactions/registerPopupHoverSync.js";
import { bindOverlapPicker } from "../features/map/interactions/overlapPicker.js";
import { addReferenceLayers } from "../features/map/layers/addReferenceLayers.js";
import { getAllLayers } from "../features/map/core/layerRegistry.js";
import {
  applyDisplayScaleVisibility,
  bindDisplayScaleVisibility,
} from "../features/map/scale/displayScaleVisibility.js";
import { createAttributeFilterService } from "../features/map/filters/attributeFilterService.js";
import { initAttributeFilterPanel } from "../features/map/filters/attributeFilterPanel.js";

function updateLastUpdated() {
  const el = document.getElementById("last-updated");

  if (!el) return;

  const now = new Date();

  el.textContent =
    "Updated: " +
    now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}

export function initMap() {
  const map = createMap();

  // const referenceLayers = addReferenceLayers(map, {
  //   onLoadError: (layer, error) => {
  //     noticeError(`Reference layer failed to load: ${layer.title}`, error.message);
  //   },
  // });

  const view = createView(map);
  const hoverManager = createHoverManager(view);

  registerPopupHoverSync(view, hoverManager);

  const filterService = createAttributeFilterService();

  const isGraphicAllowed = (graphic, layer) => {
    return filterService.matchesGraphic(graphic, layer);
  };

  const applyMapVisibility = (layers = getAllLayers()) => {
    applyDisplayScaleVisibility(view, layers, { isGraphicAllowed });
  };

  const bindMapVisibility = (layers = getAllLayers()) => {
    bindDisplayScaleVisibility(view, {
      layers,
      isGraphicAllowed,
    });
  };

  const filterPanel = initAttributeFilterPanel({
    filterService,
    applyVisibility: applyMapVisibility,
  });

  bindOverlapPicker(view);

  const refreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    createLayer,
    onLayersRebuilt: (layers) => {
      bindMapVisibility(layers);
      filterPanel.refresh();
    },
    onRefreshSuccess: ({ source, graphicsCount }) => {
      updateLastUpdated();

      if (source === "manual") {
        noticeSuccess(`Data refreshed (${graphicsCount} graphics rendered)`, null, {
          countAsUnread: false,
        });
      }
    },
    onRefreshError: (error, { source } = {}) => {
      if (source === "manual") {
        noticeError("Refresh failed", error.message);
        return;
      }

      console.warn("[Refresh] Auto refresh failed", error);
    },
  });

  return {
    map,
    view,
    hoverManager,
    refreshService,
    filterService,
    filterPanel,
    applyMapVisibility,
    bindMapVisibility,
    updateLastUpdated,
  };
}
