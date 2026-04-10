import { clearLayers, registerLayer } from "./layerRegistry.js";

export async function rebuildLayers({ map, hoverManager, layerConfigs, createLayer }) {
  hoverManager.clear();
  clearLayers(map);

  const layerViewPromises = [];

  for (const layerConfig of layerConfigs) {
    const layer = createLayer(map, layerConfig);

    layer.customId = layerConfig.id;

    registerLayer(layer);
    layerViewPromises.push(hoverManager.registerLayer(layer));
  }

  await Promise.all(layerViewPromises);
}
