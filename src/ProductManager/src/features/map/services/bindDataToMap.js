import { createLayer } from "../core/layerFactory.js";
import { rebuildLayers } from "../core/rebuildLayers.js";
import { bindDisplayScaleVisibility } from "../scale/displayScaleVisibility.js";

export async function bindDataToMap({ map, view, hoverManager, layers, onProgress }) {
  const createdLayers = await rebuildLayers({
    map,
    view,
    hoverManager,
    layerConfigs: layers,
    createLayer,
    onProgress,
  });

  const displayScaleVisibility = bindDisplayScaleVisibility(view, {
    layers: createdLayers,
  });

  return {
    inputLayerCount: layers.length,
    renderedLayerCount: createdLayers.length,
    renderedLayers: createdLayers.map((layer) => ({
      id: layer.customId,
      appLayerId: layer.appLayerId,
      role: layer.appLayerRole,
      title: layer.title,
      type: layer.type,
      visible: layer.visible,
      minScale: layer.minScale,
      maxScale: layer.maxScale,
      graphicsCount: layer.graphics?.length ?? 0,
    })),
    displayScaleVisibility,
  };
}
