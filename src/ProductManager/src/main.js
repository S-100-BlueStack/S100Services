import "./style.css";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { inspectLayer } from "./utils/debugLayer";
import { configureArcGIS } from "./config/arcgisConfig.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { stylePopups } from "./utils/stylePopups.js";
import { zoomOut } from "./utils/popupActions.js";
import { addGeoJsonLayer } from "./map/AddGeoJsonLayer.js";
import { loadNavbar } from "./utils/loaders.js";
import { enableHoverHighlight } from "./interactions/hoverHightlight.js";
configureArcGIS();

//loadNavbar();

const map = createMap();

const view = createView(map);

const geoJsonLayer = addGeoJsonLayer(
  map,
  "https://localhost:7271/mock/products",
);
enableHoverHighlight(view, geoJsonLayer);

reactiveUtils.on(
  () => view.popup,
  "trigger-action",
  (event) => {
    if (event.action.id === "zoom-out") {
      zoomOut(view);
    }
  },
);
