export const LAYER_KINDS = Object.freeze({
  PRODUCT_CORRECTIONS: "product-corrections",
});

export const PRODUCT_CORRECTIONS_LAYER_ID = "aoi";

const DEFAULT_LAYER_CAPABILITIES = Object.freeze({
  supportsPopup: false,
  supportsPopupActions: false,
  supportsProductActions: false,
  supportsDisplayScale: false,
  supportsAttributeFilters: false,
  supportsProductHistory: false,
  supportsOverlapPicker: false,
});

export const layerDefinitions = Object.freeze([
  Object.freeze({
    id: PRODUCT_CORRECTIONS_LAYER_ID,
    layerKind: LAYER_KINDS.PRODUCT_CORRECTIONS,
    displayName: "Product corrections",
    capabilities: Object.freeze({
      ...DEFAULT_LAYER_CAPABILITIES,
      supportsPopup: true,
      supportsPopupActions: true,
      supportsProductActions: true,
      supportsDisplayScale: true,
      supportsAttributeFilters: true,
      supportsProductHistory: true,
      supportsOverlapPicker: true,
    }),
  }),
]);

const definitionsById = new Map(layerDefinitions.map((definition) => [definition.id, definition]));

export function getLayerDefinition(layerId) {
  return definitionsById.get(normalizeLayerId(layerId)) ?? null;
}

export function resolveLayerId(source) {
  if (typeof source === "string") {
    return normalizeLayerId(source);
  }

  return normalizeLayerId(
    source?.appLayerId ??
      source?.customId ??
      source?.layerId ??
      source?.id ??
      source?.attributes?.layerId ??
      source?.layer?.appLayerId ??
      source?.layer?.customId
  );
}

export function resolveLayerKind(source) {
  if (typeof source === "string") {
    return getLayerDefinition(source)?.layerKind ?? null;
  }

  return (
    source?.appLayerKind ??
    source?.layerKind ??
    source?.attributes?.layerKind ??
    getLayerDefinition(resolveLayerId(source))?.layerKind ??
    null
  );
}

export function resolveLayerCapabilities(source) {
  const definition =
    getLayerDefinition(resolveLayerId(source)) ?? getFallbackDefinitionForAttributes(source);

  return {
    ...DEFAULT_LAYER_CAPABILITIES,
    ...(definition?.capabilities ?? {}),
    ...(source?.appLayerCapabilities ?? source?.capabilities ?? {}),
  };
}

export function layerSupportsCapability(source, capabilityName) {
  return Boolean(resolveLayerCapabilities(source)[capabilityName]);
}

export function attributesSupportLayerCapability(attributes, capabilityName) {
  return layerSupportsCapability(attributes, capabilityName);
}

function getFallbackDefinitionForAttributes(source) {
  if (!looksLikeProductCorrectionAttributes(source)) {
    return null;
  }

  // Existing product graphics should have `layerId`, but this fallback keeps
  // popup actions stable if refreshed API attributes omit frontend metadata.
  return getLayerDefinition(PRODUCT_CORRECTIONS_LAYER_ID);
}

function looksLikeProductCorrectionAttributes(source) {
  if (!source || typeof source !== "object") {
    return false;
  }

  return Boolean(
    source.datasetName ??
    source.DatasetName ??
    source.datasetname ??
    source.edition ??
    source.Edition ??
    source.update ??
    source.Update
  );
}

function normalizeLayerId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
