import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";

import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { configureArcGIS } from "./config/arcgisConfig.js";
import { addGeoJsonLayerFromData } from "./map/AddGeoJsonLayer.js";
import { loadNavbar } from "./utils/loaders.js";
import { enableHoverHighlight } from "./interactions/hoverHightlight.js";
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
let map;
let view;
let geoJsonLayer;
let hoverManager;

const abortController = new AbortController();

//
// ---------------- UI INIT ----------------
//
async function initUI() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
}

//
// ---------------- MAP INIT ----------------
//
function initMap() {
  map = createMap();
  view = createView(map);
  hoverManager = createHoverManager(view);
}

//
// ---------------- DATA ----------------
//
async function fetchGeoJson() {
  const response = await fetch("https://localhost:7271/mock/products", {
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(`GeoJSON request failed: ${response.status}`);
  }

  return await response.json();
}

async function loadAppData() {
  const [statuses, usages] = await Promise.all([loadStatuses(), loadUsages()]);

  const geoJson = await fetchGeoJson();

  return { statuses, usages, geoJson };
}

//
// ---------------- BIND ----------------
//
function bindDataToMap(data) {
  geoJsonLayer = addGeoJsonLayerFromData(map, data.geoJson);

  hoverManager.registerLayer(geoJsonLayer);
  enableHoverHighlight(view, geoJsonLayer);
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
    bindDataToMap(data);

    hideLoader();

    noticeSuccess("Data loaded");
    resetUnread();
  } catch (error) {
    setLoaderText("Failed to load data");

    // du kan vælge at holde loader synlig her
    // eller skjule den:
    setTimeout(() => hideLoader(), 1500);

    noticeError(`Data failed permanently: ${error.message}`);
  }
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

    loadDataIncrementally();
  } catch (error) {
    hideLoader();
    noticeError(`Application failed: ${error.message}`);
  }
}

bootstrap();
