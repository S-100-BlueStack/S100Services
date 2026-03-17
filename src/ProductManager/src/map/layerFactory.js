import { addGeoJsonLayerFromData } from "./AddGeoJsonLayer.js";

export function createLayer(map, layerConfig) {
  const { type = "geojson", data } = layerConfig;

  switch (type) {
    case "geojson":
      return addGeoJsonLayerFromData(map, data);

    // Fremtid:
    // case "graphics":
    //   return createGraphicsLayer(map, data);

    default:
      throw new Error(`Unsupported layer type: ${type}`);
  }
}
