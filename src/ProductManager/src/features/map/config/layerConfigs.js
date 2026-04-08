import { fetchGeoJson } from "../../data/services/dataLoader.js";
import { fetchAOI } from "../../data/services/dataLoader.js";

export const layerConfigs = [
  // {
  //   id: "mock",
  //   type: "graphics",
  //   dataFormat: "geojson",
  //   fetch: fetchGeoJson,
  // },
  {
    id: "aoi",
    type: "graphics",
    dataFormat: "esri-json",
    fetch: fetchAOI,
  },
];
