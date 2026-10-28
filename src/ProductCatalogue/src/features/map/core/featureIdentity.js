function normalizeKeyPart(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveFeatureKey(attributes = {}, layerId = "") {
  const sourceKey =
    normalizeKeyPart(attributes.featureKey) ??
    normalizeKeyPart(attributes.datasetName) ??
    normalizeKeyPart(attributes.name) ??
    normalizeKeyPart(attributes.id);

  if (!sourceKey) {
    return null;
  }

  return layerId ? `${layerId}:${sourceKey}` : sourceKey;
}

export function getGraphicFeatureKey(graphic) {
  return graphic?.attributes?.featureKey ?? null;
}

export function getGraphicInteractionIdentity(graphic) {
  const productIdentityKey = normalizeKeyPart(graphic?.attributes?.productIdentityKey);

  if (productIdentityKey) {
    return `product:${productIdentityKey}`;
  }

  const featureKey = normalizeKeyPart(graphic?.attributes?.featureKey);
  const layerId = normalizeKeyPart(graphic?.layer?.appLayerId ?? graphic?.layer?.customId);

  if (!featureKey || !layerId) {
    return null;
  }

  return `feature:${layerId}:${featureKey}`;
}
