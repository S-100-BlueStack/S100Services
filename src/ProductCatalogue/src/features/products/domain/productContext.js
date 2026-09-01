import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import {
  LAYER_KINDS,
  PRODUCT_CORRECTIONS_LAYER_ID,
  resolveLayerId,
  resolveLayerKind,
} from "../../map/config/layerDefinitions.js";

// This adapter ID is intentionally not part of the data source registry. It only
// names the temporary combined AOI contract while separate S-57/S-101 reads are unavailable.
export const COMPATIBILITY_PRODUCT_SOURCE_ID = "compatibility-aoi";

export const PRODUCT_OPERATION_CAPABILITY = Object.freeze({
  FREEZE: "freeze",
  UNFREEZE: "unfreeze",
  SEND_TO_IC_ENC: "sendToIcEnc",
  CANCEL_EXPORT: "cancelExport",
  HISTORY: "history",
  IC_ENC_REPORTS: "icEncReports",
  INTERNAL_VALIDATION: "internalValidation",
  EXPORT_EDITION: "exportEdition",
  EXPORT_UPDATE: "exportUpdate",
  POPUP_EXPORT: "popupExport",
  PRODUCT_COLLECTION: "productCollection",
  PRODUCT_SEARCH: "productSearch",
  ANALYZE: "analyze",
  REVIEW: "review",
  BACKEND_PRODUCT_REFRESH: "backendProductRefresh",
});

export const PRODUCT_CONTENT_TYPE = Object.freeze({
  HISTORY: "history",
  IC_ENC_REPORTS: "icEncReports",
  INTERNAL_VALIDATION: "internalValidation",
});

const COMPATIBILITY_CAPABILITIES = Object.freeze({
  [PRODUCT_OPERATION_CAPABILITY.FREEZE]: true,
  [PRODUCT_OPERATION_CAPABILITY.UNFREEZE]: true,
  [PRODUCT_OPERATION_CAPABILITY.SEND_TO_IC_ENC]: true,
  [PRODUCT_OPERATION_CAPABILITY.CANCEL_EXPORT]: true,
  [PRODUCT_OPERATION_CAPABILITY.HISTORY]: true,
  [PRODUCT_OPERATION_CAPABILITY.IC_ENC_REPORTS]: true,
  [PRODUCT_OPERATION_CAPABILITY.INTERNAL_VALIDATION]: true,
  [PRODUCT_OPERATION_CAPABILITY.EXPORT_EDITION]: true,
  [PRODUCT_OPERATION_CAPABILITY.EXPORT_UPDATE]: false,
  [PRODUCT_OPERATION_CAPABILITY.POPUP_EXPORT]: true,
  [PRODUCT_OPERATION_CAPABILITY.PRODUCT_COLLECTION]: true,
  [PRODUCT_OPERATION_CAPABILITY.PRODUCT_SEARCH]: true,
  [PRODUCT_OPERATION_CAPABILITY.ANALYZE]: true,
  [PRODUCT_OPERATION_CAPABILITY.REVIEW]: true,
  [PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH]: true,
});

const COMPATIBILITY_EXPORT_CONFIGURATION = Object.freeze({
  visible: true,
  leaves: Object.freeze([
    Object.freeze({
      id: "export-edition",
      label: "Edition",
      operationKind: "Edition",
      capability: PRODUCT_OPERATION_CAPABILITY.EXPORT_EDITION,
      visible: true,
      implemented: true,
      backendTarget: EXPORT_TARGET.S100,
      handlerId: "export-new-edition",
      availabilityReason: null,
      confirmation: Object.freeze({
        title: "Export edition for {datasetName}",
        message: "Are you sure you want to export a new Edition for {datasetName}?",
        confirmText: "Export edition",
      }),
    }),
    Object.freeze({
      id: "export-update",
      label: "Update",
      operationKind: "Update",
      capability: PRODUCT_OPERATION_CAPABILITY.EXPORT_UPDATE,
      visible: true,
      implemented: false,
      backendTarget: null,
      handlerId: null,
      availabilityReason:
        "Export Update is not available until the backend provides an implemented update contract.",
    }),
  ]),
});

const COMPATIBILITY_CONTENT_CONFIGURATION = deepFreeze({
  [PRODUCT_CONTENT_TYPE.HISTORY]: {
    visible: true,
    implemented: true,
    loaderId: "compatibility-history",
    availabilityReason: null,
  },
  [PRODUCT_CONTENT_TYPE.IC_ENC_REPORTS]: {
    visible: true,
    implemented: true,
    loaderId: "compatibility-analyze",
    availabilityReason: null,
  },
  [PRODUCT_CONTENT_TYPE.INTERNAL_VALIDATION]: {
    visible: true,
    implemented: true,
    loaderId: "compatibility-analyze",
    availabilityReason: null,
  },
});

const HIDDEN_CONTENT_CONFIGURATION = Object.freeze({
  visible: false,
  implemented: false,
  loaderId: null,
  availabilityReason: "This Product content surface is not available for the selected source.",
});

const KNOWN_PRODUCT_CAPABILITIES = new Set(Object.values(PRODUCT_OPERATION_CAPABILITY));
const KNOWN_PRODUCT_CONTENT_TYPES = new Set(Object.values(PRODUCT_CONTENT_TYPE));
const GRAPHIC_PRODUCT_CONTEXTS = new WeakMap();
const PRODUCT_CONTEXTS_BY_IDENTITY = new Map();

/**
 * Resolves the selected Graphic into the central source-aware Product context.
 * Registered sources must carry metadata installed by dataSourceMapAdapter;
 * compatibility AOI products are admitted only through the explicit layer adapter.
 */
export function resolveProductContext({ graphic, attributes, layer } = {}) {
  const resolvedGraphic = graphic ?? null;
  const resolvedAttributes = attributes ?? resolvedGraphic?.attributes ?? {};
  const exactRegisteredContext = resolveExactRegisteredGraphicProductContext(
    resolvedGraphic,
    resolvedAttributes
  );
  if (exactRegisteredContext.state === "resolved") {
    return exactRegisteredContext.productContext;
  }
  if (exactRegisteredContext.state === "invalid") {
    return null;
  }

  const resolvedLayer = layer ?? resolvedGraphic?.layer ?? null;
  const layerSource = resolvedGraphic ?? {
    attributes: resolvedAttributes,
    layer: resolvedLayer,
  };
  const layerId = resolveLayerId(layerSource);
  const layerKind = resolveLayerKind(layerSource);
  const attributeSourceId = normalizeText(resolvedAttributes?.sourceId);
  const layerSourceId = resolveRegisteredLayerSourceId(resolvedLayer);

  // Main-map layer metadata is authoritative. Analyze registration is a bridge for
  // generic mixed-source layers and must never override a committed Main-map layer.
  if (isCompatibilityLayer({ layerId, layerKind })) {
    return createCompatibilityProductContext({
      graphic: resolvedGraphic,
      attributes: resolvedAttributes,
      layerId,
    });
  }

  if (hasRegisteredSourceLayerMetadata(resolvedLayer, layerSourceId)) {
    return createRegisteredSourceProductContext({
      attributeSourceId,
      layerSourceId,
      layerId,
      layerKind,
      graphic: resolvedGraphic,
      attributes: resolvedAttributes,
      layer: resolvedLayer,
    });
  }

  const registeredIdentityContext = resolveRegisteredProductIdentityContext(resolvedAttributes);
  if (registeredIdentityContext.state === "resolved") {
    return registeredIdentityContext.productContext;
  }
  if (registeredIdentityContext.state === "invalid") {
    return null;
  }

  logUnresolvedProductContext({ layerId, layerKind, attributeSourceId, layerSourceId });
  return null;
}

export function createCompatibilityProductContext({ graphic, attributes, layerId } = {}) {
  const resolvedAttributes = attributes ?? graphic?.attributes ?? {};
  const datasetName = getDatasetName(resolvedAttributes);
  const productKey = resolveProductKey(resolvedAttributes, datasetName);
  const resolvedLayerId = normalizeText(layerId) ?? resolveLayerId(graphic ?? resolvedAttributes);

  if (!datasetName || !productKey || !isCompatibilityLayer({ layerId: resolvedLayerId })) {
    logUnresolvedProductContext({
      layerId: resolvedLayerId,
      layerKind: resolveLayerKind(graphic ?? resolvedAttributes),
      sourceId: null,
    });
    return null;
  }

  return createResolvedProductContext({
    sourceId: COMPATIBILITY_PRODUCT_SOURCE_ID,
    sourceLabel: "Compatibility AOI",
    productKey,
    datasetName,
    productType: "compatibility-product",
    layerId: resolvedLayerId,
    capabilities: COMPATIBILITY_CAPABILITIES,
    exportConfiguration: COMPATIBILITY_EXPORT_CONFIGURATION,
    contentConfiguration: COMPATIBILITY_CONTENT_CONFIGURATION,
    graphic,
    data: null,
  });
}

export function createCompatibilityWorkspaceProductContext(datasetName, { data = null } = {}) {
  const normalizedDatasetName = normalizeText(datasetName);
  if (!normalizedDatasetName) {
    return null;
  }

  return createResolvedProductContext({
    sourceId: COMPATIBILITY_PRODUCT_SOURCE_ID,
    sourceLabel: "Compatibility AOI",
    productKey: normalizedDatasetName,
    datasetName: normalizedDatasetName,
    productType: "compatibility-product",
    layerId: null,
    capabilities: COMPATIBILITY_CAPABILITIES,
    exportConfiguration: COMPATIBILITY_EXPORT_CONFIGURATION,
    contentConfiguration: COMPATIBILITY_CONTENT_CONFIGURATION,
    graphic: null,
    data,
  });
}

export function createWorkspaceProductContext({
  sourceId,
  sourceLabel,
  productKey,
  datasetName,
  productType,
  capabilities,
  exportConfiguration = null,
  contentConfiguration = null,
  data = null,
} = {}) {
  const normalizedSourceId = normalizeText(sourceId);
  const normalizedProductKey = normalizeText(productKey);
  const normalizedDatasetName = normalizeText(datasetName);
  const normalizedProductType = normalizeText(productType);

  if (
    !normalizedSourceId ||
    !normalizedProductKey ||
    !normalizedDatasetName ||
    !normalizedProductType ||
    !capabilities ||
    typeof capabilities !== "object"
  ) {
    logUnresolvedProductContext({
      sourceId: normalizedSourceId,
      productKey: normalizedProductKey,
      datasetName: normalizedDatasetName,
      productType: normalizedProductType,
    });
    return null;
  }

  return createResolvedProductContext({
    sourceId: normalizedSourceId,
    sourceLabel: normalizeText(sourceLabel) ?? normalizedSourceId,
    productKey: normalizedProductKey,
    datasetName: normalizedDatasetName,
    productType: normalizedProductType,
    layerId: null,
    capabilities,
    exportConfiguration,
    contentConfiguration,
    graphic: null,
    data,
  });
}

export function createProductContextIdentityAttributes(productContext) {
  if (!isResolvedProductContext(productContext)) {
    return null;
  }

  return Object.freeze({
    sourceId: productContext.sourceId,
    sourceLabel: productContext.sourceLabel,
    productKey: productContext.productKey,
    productIdentityKey: productContext.identityKey,
    productType: productContext.productType,
    datasetName: productContext.datasetName,
  });
}

export function registerGraphicProductContext(graphic, productContext) {
  if (!graphic || typeof graphic !== "object" || !isResolvedProductContext(productContext)) {
    return false;
  }
  if (!attributesMatchProductContext(graphic.attributes, productContext)) {
    logUnresolvedProductContext({
      reason: "graphic-product-context-metadata-mismatch",
      sourceId: productContext.sourceId,
      productKey: productContext.productKey,
      datasetName: productContext.datasetName,
    });
    return false;
  }

  GRAPHIC_PRODUCT_CONTEXTS.set(graphic, productContext);
  PRODUCT_CONTEXTS_BY_IDENTITY.set(productContext.identityKey, productContext);
  return true;
}

export function productContextSupportsCapability(productContext, capabilityName) {
  if (!productContext || !KNOWN_PRODUCT_CAPABILITIES.has(capabilityName)) {
    return false;
  }

  return productContext.capabilities?.[capabilityName] === true;
}

export function getProductContextCapabilityReason(productContext, capabilityName) {
  if (!productContext) {
    return "The selected Product source could not be resolved.";
  }
  if (!KNOWN_PRODUCT_CAPABILITIES.has(capabilityName)) {
    return "The selected Product source does not declare this capability.";
  }
  if (productContextSupportsCapability(productContext, capabilityName)) {
    return null;
  }

  return `The ${productContext.sourceLabel ?? "selected"} source does not support this action.`;
}

export function getProductContentConfiguration(productContext, contentType) {
  if (!productContext || !KNOWN_PRODUCT_CONTENT_TYPES.has(contentType)) {
    return HIDDEN_CONTENT_CONFIGURATION;
  }

  const configuration = productContext.contentConfiguration?.[contentType];
  if (!configuration || typeof configuration !== "object") {
    return HIDDEN_CONTENT_CONFIGURATION;
  }

  return configuration;
}

export function isCompatibilityProductContext(productContext) {
  return productContext?.sourceId === COMPATIBILITY_PRODUCT_SOURCE_ID;
}

export function getProductContextIdentityKey(productContext) {
  return normalizeText(productContext?.identityKey);
}

function resolveExactRegisteredGraphicProductContext(graphic, attributes) {
  if (!graphic || typeof graphic !== "object" || !GRAPHIC_PRODUCT_CONTEXTS.has(graphic)) {
    return { state: "absent", productContext: null };
  }

  const productContext = GRAPHIC_PRODUCT_CONTEXTS.get(graphic);
  if (!attributesMatchProductContext(attributes, productContext)) {
    logUnresolvedProductContext({
      reason: "registered-graphic-product-context-metadata-mismatch",
      sourceId: productContext?.sourceId,
      productKey: productContext?.productKey,
      datasetName: productContext?.datasetName,
    });
    return { state: "invalid", productContext: null };
  }

  return { state: "resolved", productContext };
}

function resolveRegisteredProductIdentityContext(attributes) {
  const identityKey = normalizeText(attributes?.productIdentityKey);
  if (!identityKey) {
    return { state: "absent", productContext: null };
  }

  if (!hasCompleteProductIdentityMetadata(attributes)) {
    logUnresolvedProductContext({
      reason: "registered-product-identity-metadata-incomplete",
      productIdentityKey: identityKey,
    });
    return { state: "invalid", productContext: null };
  }

  if (!PRODUCT_CONTEXTS_BY_IDENTITY.has(identityKey)) {
    return { state: "absent", productContext: null };
  }

  const productContext = PRODUCT_CONTEXTS_BY_IDENTITY.get(identityKey);
  if (!attributesMatchProductContext(attributes, productContext)) {
    logUnresolvedProductContext({
      reason: "registered-product-identity-metadata-mismatch",
      sourceId: productContext?.sourceId,
      productKey: productContext?.productKey,
      datasetName: productContext?.datasetName,
    });
    return { state: "invalid", productContext: null };
  }

  return { state: "resolved", productContext };
}

function hasCompleteProductIdentityMetadata(attributes) {
  return Boolean(
    normalizeText(attributes?.sourceId) &&
    normalizeText(attributes?.productKey) &&
    normalizeText(attributes?.productIdentityKey) &&
    normalizeText(attributes?.productType) &&
    normalizeText(getDatasetName(attributes))
  );
}

function resolveRegisteredLayerSourceId(layer) {
  return normalizeText(layer?.appSourceId ?? layer?.dataSourceId ?? layer?.sourceId);
}

function hasRegisteredSourceLayerMetadata(layer, layerSourceId) {
  return Boolean(layerSourceId || layer?.appSourceDefinition);
}

function attributesMatchProductContext(attributes, productContext) {
  const identityAttributes = createProductContextIdentityAttributes(productContext);
  if (!identityAttributes || !attributes || typeof attributes !== "object") {
    return false;
  }

  return (
    normalizeText(attributes.sourceId) === identityAttributes.sourceId &&
    normalizeText(attributes.productKey) === identityAttributes.productKey &&
    normalizeText(attributes.productIdentityKey) === identityAttributes.productIdentityKey &&
    normalizeText(attributes.productType) === identityAttributes.productType &&
    normalizeText(getDatasetName(attributes)) === identityAttributes.datasetName
  );
}

function isResolvedProductContext(productContext) {
  return Boolean(
    productContext &&
    normalizeText(productContext.sourceId) &&
    normalizeText(productContext.productKey) &&
    normalizeText(productContext.identityKey) &&
    normalizeText(productContext.datasetName) &&
    normalizeText(productContext.productType) &&
    productContext.capabilities &&
    typeof productContext.capabilities === "object"
  );
}

function createRegisteredSourceProductContext({
  attributeSourceId,
  layerSourceId,
  layerId,
  graphic,
  attributes,
  layer,
}) {
  const sourceDefinition = layer?.appSourceDefinition;
  const registrySourceId = normalizeText(sourceDefinition?.id);
  const attributeProductType = normalizeText(attributes?.productType);
  const layerProductType = normalizeText(layer?.appProductType);
  const registryProductType = normalizeText(sourceDefinition?.productType);
  const datasetName = getDatasetName(attributes);
  const productKey = resolveProductKey(attributes, datasetName);

  // Runtime Product context is valid only when the normalized Graphic, committed
  // layer metadata, and authoritative registry definition describe the same source.
  if (
    !attributeSourceId ||
    !layerSourceId ||
    !registrySourceId ||
    attributeSourceId !== layerSourceId ||
    layerSourceId !== registrySourceId ||
    !sourceDefinition?.capabilities ||
    typeof sourceDefinition.capabilities !== "object" ||
    !attributeProductType ||
    !layerProductType ||
    !registryProductType ||
    attributeProductType !== layerProductType ||
    layerProductType !== registryProductType ||
    !productKey
  ) {
    logUnresolvedProductContext({
      layerId,
      attributeSourceId,
      layerSourceId,
      registrySourceId,
      attributeProductType,
      layerProductType,
      registryProductType,
    });
    return null;
  }

  return createResolvedProductContext({
    sourceId: registrySourceId,
    sourceLabel: normalizeText(sourceDefinition.label) ?? registrySourceId,
    productKey,
    datasetName,
    productType: registryProductType,
    layerId,
    capabilities: sourceDefinition.capabilities,
    exportConfiguration: sourceDefinition.exportConfiguration ?? null,
    contentConfiguration: sourceDefinition.contentConfiguration ?? null,
    graphic,
    data: null,
  });
}

function createResolvedProductContext({
  sourceId,
  sourceLabel,
  productKey,
  datasetName,
  productType,
  layerId,
  capabilities,
  exportConfiguration,
  contentConfiguration,
  graphic,
  data,
}) {
  let identityKey;
  try {
    identityKey = serializeProductIdentity({ sourceId, productKey });
  } catch (error) {
    logUnresolvedProductContext({ sourceId, layerId, error });
    return null;
  }

  return Object.freeze({
    sourceId,
    sourceLabel,
    productKey,
    identityKey,
    datasetName,
    productType,
    layerId,
    capabilities: Object.freeze({ ...capabilities }),
    exportConfiguration,
    contentConfiguration: contentConfiguration ? deepFreeze({ ...contentConfiguration }) : null,
    graphic: graphic ?? null,
    data: data ?? null,
  });
}

function isCompatibilityLayer({ layerId, layerKind } = {}) {
  return (
    normalizeText(layerId) === PRODUCT_CORRECTIONS_LAYER_ID ||
    normalizeText(layerKind) === LAYER_KINDS.PRODUCT_CORRECTIONS
  );
}

function resolveProductKey(attributes, datasetName) {
  return normalizeText(
    attributes?.productKey ??
      attributes?.productIdentity?.productKey ??
      attributes?.productIdentityKey ??
      datasetName
  );
}

function getDatasetName(attributes) {
  return normalizeText(
    attributes?.datasetName ??
      attributes?.DatasetName ??
      attributes?.datasetname ??
      attributes?.name ??
      attributes?.Name
  );
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function logUnresolvedProductContext(details) {
  if (!import.meta.env?.DEV) {
    return;
  }

  console.warn("[Product context] Product context resolution failed closed.", details);
}
