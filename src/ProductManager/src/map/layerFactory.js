import { createGraphicsLayer } from "./createGraphicsLayer.js";

export function createLayer(map, layerConfig) {
  const { type = "graphics" } = layerConfig;

  if (type !== "graphics") {
    throw new Error(`Unsupported layer type: ${type}`);
  }

  return createGraphicsLayer(map, layerConfig);
}
