import { createGraphicsLayer } from "../layers/createGraphicsLayer.js";

export async function createLayer(map, layerConfig, options = {}) {
  const { type = "graphics" } = layerConfig;

  if (type !== "graphics") {
    throw new Error(`Unsupported layer type: ${type}`);
  }

  return createGraphicsLayer(map, layerConfig, options);
}
