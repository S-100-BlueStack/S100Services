import { addGeoJsonLayerFromData } from "./addGeoJsonLayer.js";
import { createGraphicsLayer } from "./createGraphicsLayer.js";

export function createLayer(map, layerConfig) {
  const { type = "geojson" } = layerConfig;

  switch (type) {
    case "geojson": {
      const layer = addGeoJsonLayerFromData(map, layerConfig.data);
      layer.layerType = "geojson";
      return layer;
    }

    case "graphics": {
      return createGraphicsLayer(map, layerConfig);
    }

    default:
      throw new Error(`Unsupported layer type: ${type}`);
  }
}
