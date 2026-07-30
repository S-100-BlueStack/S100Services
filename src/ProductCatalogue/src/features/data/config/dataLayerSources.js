import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";
import { fetchAOI } from "../api/layerDataApi.js";

export const dataLayerSources = [
  {
    id: PRODUCT_CORRECTIONS_LAYER_ID,
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
