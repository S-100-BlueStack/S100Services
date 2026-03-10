import "./style.css";
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

configureArcGIS();

async function loadNavbar() {
  const res = await fetch("src/components/navbar.html");
  document.getElementById("navbar").innerHTML = await res.text();
}
loadNavbar();

const webId = "ec452f8ed0464ddaaec2d049b2c6fc51";
const map = createMap(webId);

const view = createView(map);

const sketch = createSketch(view);
const layerList = createLayerList(view);

const searchBar = createSearchBar(view);

const labelClassTitle = {
  symbol: {
    type: "text",
    color: "purple",
    haloSize: 1,
    haloColor: "white",
    yoffset: 5,
    font: {
      family: "Roboto",
      size: 10,
    },
  },
  maxScale: 0,
  minScale: 4000000,
  labelPlacement: "below-center",
  labelExpressionInfo: {
    expression: "$feature.title",
  },
};
const renderer = {
  type: "simple",
  symbol: {
    type: "simple-marker",
    size: 14,
    color: "purple",
    outline: {
      width: 1.5,
      color: "white",
    },
  },
};
const labelClassCount = {
  symbol: {
    type: "text",
    color: "white",
    haloSize: 0.1,
    haloColor: "white",
    yoffset: 0,
    font: {
      family: "Roboto",
      size: 8,
    },
  },
  maxScale: 0,
  minScale: 400000000,
  labelPlacement: "center-center",
  labelExpressionInfo: {
    expression: "$feature.count",
  },
};
const polygonRenderer = {
  type: "simple",
  symbol: {
    type: "simple-fill",
    color: [221, 175, 250, 0.5],
    outline: {
      color: "purple",
      width: 1,
    },
  },
};
const linestringRenderer = {
  type: "simple",
  symbol: {
    width: 2,
    type: "simple-line",
    color: "purple",
  },
};
// reactiveUtils.when(
//   () => view.popup?.visible === true,
//   () => {
//     console.log("Popup opened");

//     const feature = view.popup.selectedFeature;
//     console.log("Feature:", feature?.attributes);
//   },
// );

view.when(async () => {
  const layers = map.layers;
  stylePopups(layers);
  layers.forEach((element) => {
    //inspectLayer(element);
  });
  //view.ui.components = ["attribution"];
});
