import { clearLayers, registerLayer } from "./layerRegistry.js";

export async function rebuildLayers({ map, hoverManager, layerConfigs, createLayer }) {
  hoverManager.clear();
  clearLayers(map);

  const createdLayers = [];
  const layerViewPromises = [];

  for (const layerConfig of layerConfigs) {
    const layers = normalizeCreatedLayers(createLayer(map, layerConfig));

    for (const layer of layers) {
      // createLayer can return multiple ArcGIS layers for one logical app layer.
      // Each concrete layer must be registered separately so view.whenLayerView receives a real layer.
      layer.customId ??= layerConfig.id;

      registerLayer(layer);
      createdLayers.push(layer);
      layerViewPromises.push(hoverManager.registerLayer(layer));
    }
  }

  await Promise.all(layerViewPromises);

  return createdLayers;
}

function normalizeCreatedLayers(layerOrLayers) {
  if (Array.isArray(layerOrLayers)) {
    return layerOrLayers.filter(Boolean);
  }

  if (layerOrLayers) {
    return [layerOrLayers];
  }

  return [];
}
