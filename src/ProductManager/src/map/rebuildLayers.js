import { clearLayers, registerLayer, getAllLayers } from "./layerRegistry.js";

export async function rebuildLayers({ map, view, hoverManager, layerConfigs, createLayer }) {
  hoverManager.clear();
  clearLayers(map);

  for (const layerConfig of layerConfigs) {
    const layer = createLayer(map, layerConfig);
    layer.customId = layerConfig.id;

    registerLayer(layer);
    hoverManager.registerLayer(layer);
  }

  await Promise.all(getAllLayers().map((layer) => view.whenLayerView(layer)));
}
