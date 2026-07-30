const registry = new Map();

export function registerLayer(layer) {
  registry.set(layer.customId, layer);
}

export function getLayer(layerId) {
  return registry.get(layerId);
}

export function getAllLayers() {
  return Array.from(registry.values());
}

export function clearLayers(map) {
  for (const layer of registry.values()) {
    map.remove(layer);
  }

  registry.clear();
}
