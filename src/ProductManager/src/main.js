import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";
import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { inspectLayer } from "./utils/debugLayer";
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

let map;
let view;
let geoJsonLayer;
let hoverManager;
async function start() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
  try {
    await loadStatuses();
  } catch (error) {
    noticeError("Failed to load product states.");
  }

  try {
    map = createMap();
  } catch (error) {
    noticeError("Failed to create map.");
  }
  try {
    view = createView(map);
  } catch (error) {
    noticeError("Failed to create map view.");
  }
  try {
    hoverManager = createHoverManager(view);
  } catch (error) {
    noticeError("Failed to create hover manager.");
  }
  try {
    geoJsonLayer = addGeoJsonLayer(map, "https://localhost:7271/mock/products");
    hoverManager.registerLayer(geoJsonLayer);
  } catch (error) {
    noticeError("Failed to add GeoJSON layer.");
  }
  try {
    enableHoverHighlight(view, geoJsonLayer);
  } catch (error) {
    noticeError("Failed to enable hover highlight.");
  }
}

start();
