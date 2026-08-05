import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";
import { DATA_SOURCE_LAYER_IDS } from "../../dataSources/config/dataSourceRegistry.js";

export { PRODUCT_CORRECTIONS_LAYER_ID };

export const LAYER_KINDS = Object.freeze({
  PRODUCT_CORRECTIONS: "product-corrections",
  PAPER_CHART_PRODUCTS: "paper-chart-products",
  S102_PRODUCTS: "s102-products",
});

const DEFAULT_LAYER_CAPABILITIES = Object.freeze({
  supportsPopup: false,
  supportsPopupActions: false,
  supportsProductActions: false,
  supportsDisplayScale: false,
  supportsAttributeFilters: false,
  supportsProductHistory: false,
  supportsOverlapPicker: false,
  supportsProductSearch: false,
});
const KNOWN_LAYER_CAPABILITIES = new Set(Object.keys(DEFAULT_LAYER_CAPABILITIES));

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
      supportsProductSearch: true,
    }),
  }),
  Object.freeze({
    id: DATA_SOURCE_LAYER_IDS.PAPER_CHARTS_PRODUCTS,
    layerKind: LAYER_KINDS.PAPER_CHART_PRODUCTS,
    displayName: "Paper Charts",
    capabilities: Object.freeze({
      ...DEFAULT_LAYER_CAPABILITIES,
      supportsPopup: true,
      supportsOverlapPicker: true,
    }),
  }),
  Object.freeze({
    id: DATA_SOURCE_LAYER_IDS.S102_PRODUCTS,
    layerKind: LAYER_KINDS.S102_PRODUCTS,
    displayName: "S-102",
    capabilities: Object.freeze({
      ...DEFAULT_LAYER_CAPABILITIES,
      supportsPopup: true,
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
    ...(source?.layer?.appLayerCapabilities ?? source?.layer?.capabilities ?? {}),
    ...(source?.appLayerCapabilities ?? source?.capabilities ?? {}),
  };
}

export function layerSupportsCapability(source, capabilityName) {
  if (!isKnownLayerCapability(capabilityName)) {
    warnUnknownLayerCapability(capabilityName);
    return false;
  }

  return Boolean(resolveLayerCapabilities(source)[capabilityName]);
}

export function attributesSupportLayerCapability(attributes, capabilityName) {
  return layerSupportsCapability(attributes, capabilityName);
}

export function getKnownLayerCapabilities() {
  return Array.from(KNOWN_LAYER_CAPABILITIES);
}

function isKnownLayerCapability(capabilityName) {
  return KNOWN_LAYER_CAPABILITIES.has(capabilityName);
}

function getFallbackDefinitionForAttributes(source) {
  if (!looksLikeProductCorrectionAttributes(source)) {
    return null;
  }

  // Existing compatibility graphics should have `layerId`, but this fallback
  // keeps current popup actions stable if refreshed AOI attributes omit metadata.
  return getLayerDefinition(PRODUCT_CORRECTIONS_LAYER_ID);
}

function looksLikeProductCorrectionAttributes(source) {
  if (!source || typeof source !== "object" || source.sourceId) {
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

function warnUnknownLayerCapability(capabilityName) {
  if (!import.meta.env?.DEV) {
    return;
  }
  console.warn("[Layer definitions] Unknown layer capability", {
    capabilityName,
    knownCapabilities: getKnownLayerCapabilities(),
  });
}

function normalizeLayerId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
