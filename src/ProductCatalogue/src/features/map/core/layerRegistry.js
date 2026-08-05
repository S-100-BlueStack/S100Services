const registry = new Map();

export function registerLayer(layer) {
  const layerId = layer?.customId;
  if (!layerId) {
    throw new Error("A runtime layer requires customId before registration.");
  }

  registry.set(layerId, layer);
  return layer;
}

export function unregisterLayer(layerOrId) {
  const layerId = typeof layerOrId === "string" ? layerOrId : layerOrId?.customId;
  if (!layerId) {
    return false;
  }

  const registeredLayer = registry.get(layerId);
  if (typeof layerOrId === "object" && registeredLayer !== layerOrId) {
    return false;
  }

  return registry.delete(layerId);
}

export function getLayer(layerId) {
  return registry.get(layerId);
}

export function getAllLayers() {
  return Array.from(registry.values());
}

export function getLayersBySourceId(sourceId) {
  return getAllLayers().filter((layer) => {
    return layer?.appSourceId === sourceId || layer?.dataSourceId === sourceId;
  });
}

export function clearLayers(map, { predicate = () => true } = {}) {
  for (const [layerId, layer] of registry.entries()) {
    if (!predicate(layer)) {
      continue;
    }

    map.remove(layer);
    registry.delete(layerId);
  }
}
