import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";
import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { configureArcGIS } from "./config/arcgisConfig.js";
import { addGeoJsonLayer } from "./map/AddGeoJsonLayer.js";
import { loadNavbar } from "./utils/loaders.js";
import { enableHoverHighlight } from "./interactions/hoverHightlight.js";
import { noticeError, noticeSuccess } from "./js/services/noticeService.js";
import { initNoticeToasts } from "./js/ui/noticeToastRenderer.js";
import { initNoticePanel } from "./js/ui/noticePanel.js";
import "@esri/calcite-components/dist/components/calcite-notice";
import { initNavbarNotifications } from "./js/ui/navbarNotifications.js";
import { createHoverManager } from "./ui/hoverManager.js";
import { loadStatuses } from "./store/statusStore.js";
import { loadUsages } from "./store/usageStore.js";
import { resetUnread } from "./js/state/noticeStore.js";
let map;
let view;
let geoJsonLayer;
let hoverManager;
let succesfulLoad = true;
async function start() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
  try {
    await loadStatuses();
  } catch (error) {
    noticeError(`Failed to load product states: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    await loadUsages();
  } catch (error) {
    noticeError(`Failed to load specific usages: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    map = createMap();
  } catch (error) {
    noticeError(`Failed to create map: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    view = createView(map);
  } catch (error) {
    noticeError(`Failed to create map view: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    hoverManager = createHoverManager(view);
  } catch (error) {
    noticeError(`Failed to create hover manager: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    geoJsonLayer = addGeoJsonLayer(map, "https://localhost:7271/mock/products");
    hoverManager.registerLayer(geoJsonLayer);
  } catch (error) {
    noticeError(`Failed to add GeoJSON layer: ${error.message}`);
    succesfulLoad = false;
  }
  try {
    enableHoverHighlight(view, geoJsonLayer);
  } catch (error) {
    noticeError(`Failed to enable hover highlight: ${error.message}`);
    succesfulLoad = false;
  }
  if (succesfulLoad) {
    noticeSuccess("Application loaded successfully");
    resetUnread();
  }
}

start();
