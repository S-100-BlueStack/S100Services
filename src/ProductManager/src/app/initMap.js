import { loadAppData } from "../features/data/services/dataLoader.js";
import { createRefreshService } from "../features/map/services/refreshService.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { cancelActiveConfirmPopover } from "../shared/ui/confirm/services/confirmService.js";
import { createMap } from "../features/map/core/createMap.js";
import { createView } from "../features/map/core/createView.js";
import { createLayer } from "../features/map/core/layerFactory.js";
import { createHoverManager } from "../features/map/interactions/hoverManager.js";
import { registerPopupHoverSync } from "../features/map/interactions/registerPopupHoverSync.js";
import { bindOverlapPicker } from "../features/map/interactions/overlapPicker.js";
import { getAllLayers } from "../features/map/core/layerRegistry.js";
import {
  applyDisplayScaleVisibility,
  bindDisplayScaleVisibility,
} from "../features/map/scale/displayScaleVisibility.js";
import { createAttributeFilterService } from "../features/map/filters/attributeFilterService.js";
import { initAttributeFilterPanel } from "../features/map/filters/attributeFilterPanel.js";
import { closePopupActionDropdown } from "../features/map/popups/popupActionDropdown.js";
import { initProductCollectionTray } from "../features/productCollection/ui/productCollectionTray.js";
import { initProductHistoryPanel } from "../features/timeline/ui/productHistoryPanel.js";
import { initMainMapProductSearch } from "../features/map/search/mainMapProductSearch.js";
import { bindMapViewpointPersistence } from "../features/map/state/mapViewpointPersistence.js";
import { initPreferencesPanel } from "../features/preferences/ui/preferencesPanel.js";

function updateLastUpdated(date = new Date()) {
  const el = document.getElementById("last-updated");

  if (!el) {
    return;
  }

  el.textContent =
    "Updated: " +
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}

function setLastUpdatedStatus(text) {
  const el = document.getElementById("last-updated");

  if (!el) {
    return;
  }

  el.textContent = text;
}

function readLastUpdatedStatus() {
  return document.getElementById("last-updated")?.textContent ?? "";
}

export function initMap() {
  const map = createMap();
  const view = createView(map);
  const mapViewpointPersistence = bindMapViewpointPersistence(view);
  const hoverManager = createHoverManager(view);
  let previousLastUpdatedStatus = "";

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
  const preferencesPanel = initPreferencesPanel({
    view,
    filterPanel,
  });
  const productHistoryPanel = initProductHistoryPanel({
    view,
  });
  const productCollectionTray = initProductCollectionTray();
  const productSearch = initMainMapProductSearch({ view });
  const cleanupKeyboardClose = bindMainMapKeyboardClose({
    view,
    filterPanel,
    preferencesPanel,
    productHistoryPanel,
    productSearch,
  });

  bindOverlapPicker(view);

  const refreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    createLayer,
    onLayersRebuilt: (layers) => {
      cancelActiveConfirmPopover({
        restoreFocus: false,
      });
      bindMapVisibility(layers);
      filterPanel.refresh();
    },
    onRefreshStart: ({ source }) => {
      if (source !== "manual") {
        return;
      }

      cancelActiveConfirmPopover({
        restoreFocus: false,
      });
      previousLastUpdatedStatus = readLastUpdatedStatus();
      setLastUpdatedStatus("Refreshing...");
    },
    onRefreshSuccess: ({ source, graphicsCount, finishedAt }) => {
      updateLastUpdated(finishedAt);

      if (source === "manual") {
        noticeSuccess(`Data refreshed (${graphicsCount} graphics rendered)`, null, {
          countAsUnread: false,
        });
      }
    },
    onRefreshError: (error, { source } = {}) => {
      if (source === "manual") {
        if (previousLastUpdatedStatus) {
          setLastUpdatedStatus(previousLastUpdatedStatus);
        }

        noticeError("Refresh failed", error.message);
        return;
      }

      console.warn("[Refresh] Auto refresh failed", error);
    },
    onRefreshSkipped: ({ source, reason }) => {
      if (source === "manual") {
        console.info(`[Refresh] Manual refresh skipped: ${reason}`);
      }
    },
  });

  return {
    map,
    view,
    hoverManager,
    refreshService,
    filterService,
    filterPanel,
    productHistoryPanel,
    productCollectionTray,
    analyzeCollectionTray: productCollectionTray,
    applyMapVisibility,
    bindMapVisibility,
    updateLastUpdated,
    mapViewpointPersistence,
    preferencesPanel,
    productSearch,
    destroy() {
      cleanupKeyboardClose?.();
      productSearch?.destroy?.();
      filterPanel?.destroy?.();
      preferencesPanel?.destroy?.();
      productHistoryPanel?.destroy?.();
      productCollectionTray?.destroy?.();
      mapViewpointPersistence?.destroy?.();
    },
  };
}

function bindMainMapKeyboardClose({
  view,
  filterPanel,
  preferencesPanel,
  productHistoryPanel,
  productSearch,
}) {
  const handleKeydown = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }

    if (productSearch?.close?.()) {
      event.preventDefault();
      return;
    }

    if (closePopupDropdownOnly()) {
      event.preventDefault();
      return;
    }

    if (closeNoticePanel()) {
      event.preventDefault();
      return;
    }

    if (hasVisibleElement("#attribute-filter-panel")) {
      filterPanel?.close?.();
      event.preventDefault();
      return;
    }

    if (hasVisibleElement("#preferences-panel")) {
      preferencesPanel?.close?.();
      event.preventDefault();
      return;
    }

    if (hasVisibleElement("#product-history-panel")) {
      productHistoryPanel?.close?.();
      event.preventDefault();
      return;
    }

    if (view?.popup?.visible) {
      view.popup.close();
      event.preventDefault();
    }
  };

  document.addEventListener("keydown", handleKeydown);

  return () => {
    document.removeEventListener("keydown", handleKeydown);
  };
}

function closePopupDropdownOnly() {
  if (!hasVisibleElement(".popup-action-dropdown")) {
    return false;
  }

  closePopupActionDropdown({ restoreFocus: false });
  return true;
}

function closeNoticePanel() {
  const panel = document.getElementById("notice-panel");

  if (!(panel instanceof HTMLElement) || panel.hasAttribute("collapsed")) {
    return false;
  }

  panel.setAttribute("collapsed", "");
  return true;
}

function hasVisibleElement(selector) {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLElement) || element.hidden) {
    return false;
  }

  return element.offsetParent !== null || getComputedStyle(element).position === "fixed";
}
