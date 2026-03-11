import "./style.css";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { createMap } from "./map/createMap.js";
import { createView } from "./map/createView.js";
import { inspectLayer } from "./utils/debugLayer";
import { configureArcGIS } from "./config/arcgisConfig.js";
import { createSketch } from "./map/createSketch.js";
import { createLayerList } from "./widgets/layerList.js";
import { createSearchBar } from "./widgets/search.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { stylePopups } from "./utils/stylePopups.js";
import { zoomOut } from "./utils/popupActions.js";
import { addGeoJsonLayer } from "./map/AddGeoJsonLayer.js";

configureArcGIS();

async function loadNavbar() {
  const res = await fetch("src/components/navbar.html");
  document.getElementById("navbar").innerHTML = await res.text();
}
//loadNavbar();

const map = createMap();

const view = createView(map);

//const geojson = await fetchGeoJson("/mock/products");
addGeoJsonLayer(map, "https://localhost:7271/mock/products");

let zoomOutAction = {
  // This text is displayed as a tooltip
  title: "Zoom out",
  // The ID by which to reference the action in the event handler
  id: "zoom-out",
  // Sets the icon font used to style the action button
  className: "esri-icon-zoom-out-magnifying-glass",
};

const sketch = createSketch(view);
const layerList = createLayerList(view);

const searchBar = createSearchBar(view);

// reactiveUtils.when(
//   () => view.popup?.visible === true,
//   () => {
//     console.log("Popup opened");

//     const feature = view.popup.selectedFeature;
//     console.log("Feature:", feature?.attributes);
//   },
// );
reactiveUtils.on(
  () => view.popup,
  "trigger-action",
  (event) => {
    if (event.action.id === "zoom-out") {
      zoomOut(view);
    }
  },
);

view.when(async () => {
  const layers = map.layers;
  stylePopups(layers);
  layers.forEach((element) => {
    //inspectLayer(element);
  });
  // view.ui.move("attribution", "bottom-right");
});
