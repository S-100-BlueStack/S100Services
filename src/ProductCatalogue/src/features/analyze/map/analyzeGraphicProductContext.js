import {
  createProductContextIdentityAttributes,
  registerGraphicProductContext,
} from "../../products/domain/productContext.js";

export function createCompatibilityAnalyzeEntry(product, index) {
  if (!product?.aoiGeometry || !product.productContext) {
    return null;
  }

  const featureKey = createAnalyzeFeatureKey(product, index);
  const identityAttributes = createProductContextIdentityAttributes(product.productContext);
  if (!identityAttributes) {
    return null;
  }

  return {
    featureKey,
    productContext: product.productContext,
    feature: {
      geometry: product.aoiGeometry,
      attributes: {
        ...identityAttributes,
        edition: product.edition,
        update: product.update,
        status: product.status,
        usageBand: product.usageBand,
        issueDate: product.issueDate,
        errorMessage: product.errorMessage,
        featureKey,
      },
    },
  };
}

export function createSourceAnalyzeEntry(product, index) {
  if (!product?.sourceFeature || !product.productContext) {
    return null;
  }

  const featureKey = createAnalyzeFeatureKey(product, index);
  const identityAttributes = createProductContextIdentityAttributes(product.productContext);
  if (!identityAttributes) {
    return null;
  }

  return {
    featureKey,
    productContext: product.productContext,
    feature: {
      ...product.sourceFeature,
      type: "Feature",
      properties: {
        ...(product.sourceFeature.properties ?? {}),
        ...identityAttributes,
        featureKey,
      },
    },
  };
}

export function createProductContextLookup(entries) {
  const lookup = new Map();
  const duplicateIdentityKeys = new Set();

  for (const entry of entries ?? []) {
    const productContext = entry?.productContext;
    const identityKey = normalizeIdentityKey(productContext?.identityKey);
    const featureIdentityKey = normalizeIdentityKey(
      entry?.feature?.attributes?.productIdentityKey ??
        entry?.feature?.properties?.productIdentityKey
    );

    if (!identityKey || featureIdentityKey !== identityKey) {
      continue;
    }

    // Duplicate Product identity is invalid for Analyze registration. Remove every
    // candidate for that identity so no arbitrary ProductContext can win.
    if (lookup.has(identityKey) || duplicateIdentityKeys.has(identityKey)) {
      lookup.delete(identityKey);
      duplicateIdentityKeys.add(identityKey);
      continue;
    }

    lookup.set(identityKey, productContext);
  }

  return lookup;
}

export function registerAnalyzeGraphicProductContexts(layer, productContextByIdentityKey) {
  if (!layer?.graphics || !(productContextByIdentityKey instanceof Map)) {
    return;
  }

  layer.graphics.forEach((graphic) => {
    const identityKey = normalizeIdentityKey(graphic?.attributes?.productIdentityKey);
    const productContext = identityKey ? productContextByIdentityKey.get(identityKey) : null;
    if (!productContext) {
      return;
    }

    registerGraphicProductContext(graphic, productContext);
  });
}

function createAnalyzeFeatureKey(product, index) {
  return `analyze:${product.productContext?.identityKey ?? product.datasetName}:${index}`;
}

function normalizeIdentityKey(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
