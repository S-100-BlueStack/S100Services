import { loadAppData } from "../features/data/services/dataLoader.js";
import { createDataSourceRuntime } from "../features/dataSources/core/createDataSourceRuntime.js";
import { createDataSourceRefreshCoordinator } from "../features/dataSources/services/dataSourceRefreshCoordinator.js";
import { createRefreshService } from "../features/map/services/refreshService.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { cancelActiveConfirmPopover } from "../shared/ui/confirm/services/confirmService.js";
import { createNavbarPopoverCoordinator } from "../shared/ui/navbarPopoverCoordinator.js";
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
import { createSourceAwareProductSearchIndex } from "../features/map/search/sourceAwareProductSearchIndex.js";
import { createCompatibilityDerivedStateAdapter } from "../features/map/services/compatibilityDerivedStateAdapter.js";
import { bindMapViewpointPersistence } from "../features/map/state/mapViewpointPersistence.js";
import { initPreferencesPanel } from "../features/preferences/ui/preferencesPanel.js";

function updateLastUpdated(date = new Date()) {
  const element = document.getElementById("last-updated");
  if (!element) return;

  element.textContent =
    "Updated: " +
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}

function setLastUpdatedStatus(text) {
  const element = document.getElementById("last-updated");
  if (element) element.textContent = text;
}

function readLastUpdatedStatus() {
  return document.getElementById("last-updated")?.textContent ?? "";
}

export function initMap() {
  const map = createMap();
  const view = createView(map);
  const mapViewpointPersistence = bindMapViewpointPersistence(view);
  const hoverManager = createHoverManager(view);
  const navbarPopoverCoordinator = createNavbarPopoverCoordinator();
  const filterService = createAttributeFilterService();
  const productSearchIndex = createSourceAwareProductSearchIndex();
  const compatibilityDerivedState = createCompatibilityDerivedStateAdapter({
    filterService,
    productSearchIndex,
  });
  let previousLastUpdatedStatus = "";
  let filterPanel = null;

  registerPopupHoverSync(view, hoverManager);

  const isGraphicAllowed = (graphic, layer) => filterService.matchesGraphic(graphic, layer);
  const applyMapVisibility = (layers = getAllLayers()) => {
    applyDisplayScaleVisibility(view, layers, { isGraphicAllowed });
  };
  const bindMapVisibility = (layers = getAllLayers()) => {
    compatibilityDerivedState.replace(layers);
    bindDisplayScaleVisibility(view, {
      layers,
      isGraphicAllowed,
    });
  };

  const dataSourceRuntime = createDataSourceRuntime({
    map,
    view,
    hoverManager,
    createLayer,
    navbarPopoverCoordinator,
    filterService,
    productSearchIndex,
    onLayersChanged: () => {
      // The controller emits its generation-guarded lifecycle event immediately
      // after this callback. Publishing visibility in a microtask keeps derived
      // filter/search state inside that same committed operation boundary.
      queueMicrotask(() => {
        applyMapVisibility();
        filterPanel?.refresh?.();
      });
    },
  });

  filterPanel = initAttributeFilterPanel({
    filterService,
    applyVisibility: applyMapVisibility,
    navbarPopoverCoordinator,
  });
  navbarPopoverCoordinator.start();

  const preferencesPanel = initPreferencesPanel({
    view,
    filterPanel,
    dataSourceController: dataSourceRuntime.controller,
  });
  const productHistoryPanel = initProductHistoryPanel({ view });
  const productCollectionTray = initProductCollectionTray();
  const productSearch = initMainMapProductSearch({ view, productSearchIndex });
  const cleanupKeyboardClose = bindMainMapKeyboardClose({
    view,
    preferencesPanel,
    productHistoryPanel,
    productSearch,
  });

  bindOverlapPicker(view);
  const compatibilityRefreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    createLayer,
    onLayersRebuilt: (layers) => {
      cancelActiveConfirmPopover({ restoreFocus: false });
      bindMapVisibility(layers);
      filterPanel.refresh();
    },
    onRefreshStart: ({ source }) => {
      if (source !== "manual") return;
      cancelActiveConfirmPopover({ restoreFocus: false });
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
        if (previousLastUpdatedStatus) setLastUpdatedStatus(previousLastUpdatedStatus);
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
  const refreshService = createDataSourceRefreshCoordinator({
    compatibilityRefreshService,
    dataSourceController: dataSourceRuntime.controller,
  });

  return {
    map,
    view,
    hoverManager,
    refreshService,
    compatibilityRefreshService,
    dataSourceController: dataSourceRuntime.controller,
    dataSourcePanel: dataSourceRuntime.panel,
    dataSourceRegistry: dataSourceRuntime.registry,
    filterService,
    filterPanel,
    productSearchIndex,
    productHistoryPanel,
    productCollectionTray,
    analyzeCollectionTray: productCollectionTray,
    applyMapVisibility,
    bindMapVisibility,
    updateLastUpdated,
    mapViewpointPersistence,
    preferencesPanel,
    productSearch,
    navbarPopoverCoordinator,
    destroy() {
      cleanupKeyboardClose?.();
      refreshService.destroy?.();
      productSearch?.destroy?.();
      filterPanel?.destroy?.();
      dataSourceRuntime.destroy();
      navbarPopoverCoordinator.destroy();
      preferencesPanel?.destroy?.();
      productHistoryPanel?.destroy?.();
      productCollectionTray?.destroy?.();
      mapViewpointPersistence?.destroy?.();
    },
  };
}

function bindMainMapKeyboardClose({ view, preferencesPanel, productHistoryPanel, productSearch }) {
  const handleKeydown = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;

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
  return () => document.removeEventListener("keydown", handleKeydown);
}

function closePopupDropdownOnly() {
  if (!hasVisibleElement(".popup-action-dropdown")) return false;
  closePopupActionDropdown({ restoreFocus: false });
  return true;
}

function closeNoticePanel() {
  const panel = document.getElementById("notice-panel");
  if (!(panel instanceof HTMLElement) || panel.hasAttribute("collapsed")) return false;
  panel.setAttribute("collapsed", "");
  return true;
}

function hasVisibleElement(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement) || element.hidden) return false;
  return element.offsetParent !== null || getComputedStyle(element).position === "fixed";
}
