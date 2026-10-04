import Map from "@arcgis/core/Map.js";

export function createMap() {
  return new Map({
    basemap: "topo-vector",
  });
}
