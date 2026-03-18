import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";

import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { configureArcGIS } from "./config/arcgisConfig.js";
import { loadNavbar } from "./utils/loaders.js";
import { noticeError, noticeSuccess } from "./js/services/noticeService.js";
import { initNoticeToasts } from "./js/ui/noticeToastRenderer.js";
import { initNoticePanel } from "./js/ui/noticePanel.js";
import "@esri/calcite-components/dist/components/calcite-notice";
import "@esri/calcite-components/dist/components/calcite-loader";
import { initNavbarNotifications } from "./js/ui/navbarNotifications.js";
import { createHoverManager } from "./ui/hoverManager.js";
import { loadStatuses } from "./store/statusStore.js";
import { loadUsages } from "./store/usageStore.js";
import { resetUnread } from "./js/state/noticeStore.js";
import { runWithRetry } from "./utils/retryRunner.js";
import { showLoader, hideLoader, setLoaderText } from "./ui/loader.js";
import { fetchGeoJson } from "./services/dataLoader.js";
import { createRefreshService } from "./services/refreshService.js";
import { createLayer } from "./map/layerFactory.js";
import { rebuildLayers } from "./map/rebuildLayers.js";

let map;
let view;
let hoverManager;
let refreshService;

const abortController = new AbortController();

const layerConfigs = [
  {
    id: "mock",
    type: "graphics",
    fetch: fetchGeoJson,
  },
];

//
// ---------------- UI INIT ----------------
//
async function initUI() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
  initRefreshControls();
}

//
// ---------------- MAP INIT ----------------
//
function initMap() {
  map = createMap();
  view = createView(map);
  hoverManager = createHoverManager(view);
  window.hoverManager = hoverManager;
  refreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    addLayer: createLayer,

    onRefreshSuccess: () => {
      updateLastUpdated();
      noticeSuccess("Data refreshed");
    },

    onRefreshError: (error) => {
      noticeError(`Refresh failed: ${error.message}`);
    },
  });
}

//
// ---------------- DATA ----------------
//
async function loadAppData() {
  const [statuses, usages] = await Promise.all([loadStatuses(), loadUsages()]);

  const layerResults = await Promise.all(
    layerConfigs.map(async (config) => {
      const data = await config.fetch();

      return {
        id: config.id,
        type: config.type,
        data,
      };
    })
  );

  return { statuses, usages, layers: layerResults };
}

//
// ---------------- BIND ----------------
//
async function bindDataToMap(data) {
  await rebuildLayers({
    map,
    view,
    hoverManager,
    layerConfigs: data.layers,
    createLayer,
  });
}

//
// ---------------- DATA FLOW ----------------
//
async function loadDataIncrementally() {
  try {
    setLoaderText("Loading data...");

    const data = await runWithRetry(loadAppData, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      signal: abortController.signal,
      onRetry: ({ attempt, delay, error }) => {
        setLoaderText(`Retrying data load (${attempt}/5)... Next attempt in ${delay / 1000}s`);

        noticeError(`Data load failed (${attempt}/5): ${error.message}`);
      },
    });

    setLoaderText("Rendering data...");
    await bindDataToMap(data);
    updateLastUpdated();

    refreshService.startAuto();

    hideLoader();

    noticeSuccess("Data loaded");
    resetUnread();
  } catch (error) {
    setLoaderText("Failed to load data");

    setTimeout(() => hideLoader(), 1500);

    noticeError(`Data failed permanently: ${error.message}`);
  }
}

//
// ---------------- REFRESH LOGIC ----------------
//
function initRefreshControls() {
  const refreshBtn = document.getElementById("refresh-button");
  const autoSwitch = document.getElementById("auto-refresh-switch");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.loading = true;

      await refreshService.refresh();
      refreshBtn.blur(); // fjerner stuck hover/active
      refreshBtn.loading = false;
    });
  }

  if (autoSwitch) {
    autoSwitch.addEventListener("calciteSwitchChange", (e) => {
      refreshService.setAuto(e.target.checked);
    });
  }
}

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
//
// ---------------- BOOTSTRAP ----------------
//
async function waitForCalcite() {
  await customElements.whenDefined("calcite-loader");
}
async function bootstrap() {
  try {
    await waitForCalcite();
    showLoader("Initializing application...");

    await initUI();

    setLoaderText("Initializing map...");
    initMap();

    await loadDataIncrementally();
  } catch (error) {
    hideLoader();
    noticeError(`Application failed: ${error.message}`);
  }
}

bootstrap();
