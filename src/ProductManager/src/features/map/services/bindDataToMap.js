import { createLayer } from "../core/layerFactory.js";
import { rebuildLayers } from "../core/rebuildLayers.js";

export async function bindDataToMap({ map, view, hoverManager, layers }) {
  await rebuildLayers({
    map,
    view,
    hoverManager,
    layerConfigs: layers,
    createLayer,
  });
}
