import { fetchGeoJson } from "../../data/services/dataLoader.js";

export const layerConfigs = [
  {
    id: "mock",
    type: "graphics",
    fetch: fetchGeoJson,
  },
];
