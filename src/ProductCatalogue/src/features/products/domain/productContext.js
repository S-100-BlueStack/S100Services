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

const KNOWN_PRODUCT_CAPABILITIES = new Set(Object.values(PRODUCT_OPERATION_CAPABILITY));

/**
 * Resolves the selected Graphic into the central source-aware Product context.
 * Registered sources must carry metadata installed by dataSourceMapAdapter;
 * compatibility AOI products are admitted only through the explicit layer adapter.
 */
export function resolveProductContext({ graphic, attributes, layer } = {}) {
  const resolvedGraphic = graphic ?? null;
  const resolvedAttributes = attributes ?? resolvedGraphic?.attributes ?? {};
  const resolvedLayer = layer ?? resolvedGraphic?.layer ?? null;
  const layerSource = resolvedGraphic ?? {
    attributes: resolvedAttributes,
    layer: resolvedLayer,
  };
  const layerId = resolveLayerId(layerSource);
  const layerKind = resolveLayerKind(layerSource);
  const attributeSourceId = normalizeText(resolvedAttributes?.sourceId);
  const layerSourceId = normalizeText(
    resolvedLayer?.appSourceId ?? resolvedLayer?.dataSourceId ?? resolvedLayer?.sourceId
  );

  if (attributeSourceId || layerSourceId) {
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

  if (isCompatibilityLayer({ layerId, layerKind })) {
    return createCompatibilityProductContext({
      graphic: resolvedGraphic,
      attributes: resolvedAttributes,
      layerId,
    });
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
    graphic,
  });
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

export function isCompatibilityProductContext(productContext) {
  return productContext?.sourceId === COMPATIBILITY_PRODUCT_SOURCE_ID;
}

export function getProductContextIdentityKey(productContext) {
  return normalizeText(productContext?.identityKey);
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
    graphic,
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
  graphic,
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
    graphic: graphic ?? null,
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

function logUnresolvedProductContext(details) {
  if (!import.meta.env?.DEV) {
    return;
  }

  console.warn("[Product context] Product context resolution failed closed.", details);
}
