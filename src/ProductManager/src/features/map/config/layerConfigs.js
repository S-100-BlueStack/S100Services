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

    // Temporary frontend fallback. Replace this with API-provided scale ranges
    // when each logical API layer starts returning its own visibility rules.
    scaleRanges: {
      overview: {
        minScale: 0,
        maxScale: 1_000_000,
      },
      detail: {
        minScale: 1_000_000,
        maxScale: 0,
      },
    },
  },
];
