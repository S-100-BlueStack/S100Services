export function findFeature(layer, featureKey) {
  if (!layer || !featureKey) {
    return null;
  }

  return layer._index?.get(featureKey) || null;
}
