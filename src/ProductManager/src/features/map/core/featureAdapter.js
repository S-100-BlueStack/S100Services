export function findFeature(layer, featureId) {
  if (!layer || !featureId) return null;

  return layer._index?.get(featureId) || null;
}
