import {
  assertUniqueProductIdentities,
  createSourceAwareProductIdentity,
  resolveStableProductKey,
  serializeProductIdentity,
} from "../domain/productIdentity.js";

export function normalizeDataSourcePayload(rawPayload, source) {
  if (source?.normalizer?.type !== "geojson-products") {
    throw new Error(
      `Unsupported normalizer type for data source "${source?.label ?? source?.id ?? "unknown"}".`
    );
  }

  const features = readGeoJsonFeatures(rawPayload, source);
  const identities = [];
  const normalizedFeatures = features.map((feature, featureIndex) => {
    const productKey = resolveStableProductKey(feature, source.identityStrategy, {
      sourceId: source.id,
      sourceLabel: source.label,
      featureIndex,
    });
    const identity = createSourceAwareProductIdentity(source.id, productKey);
    const productIdentityKey = serializeProductIdentity(identity);
    const rawProperties = readProperties(feature);
    const datasetName = resolveDatasetName({
      rawProperties,
      productKey,
      featureIndex,
      source,
    });

    identities.push(identity);
    return {
      ...feature,
      type: "Feature",
      properties: compactUndefinedValues({
        ...rawProperties,
        sourceId: source.id,
        sourceLabel: source.label,
        productType: source.productType,
        productKey,
        productIdentityKey,
        featureKey: productIdentityKey,
        datasetName,
        edition: readFirstDefined(rawProperties, ["edition"]),
        update: readFirstDefined(rawProperties, ["update"]),
        status: readFirstDefined(rawProperties, ["status", "productState"]),
        displayScale: readFirstDefined(rawProperties, ["displayScale"]),
      }),
    };
  });

  assertUniqueProductIdentities(identities, {
    sourceId: source.id,
    sourceLabel: source.label,
  });

  const data = {
    ...(isFeatureCollection(rawPayload) ? rawPayload : {}),
    type: "FeatureCollection",
    features: normalizedFeatures,
  };
  const layerDefinitions = Array.isArray(source.layerDefinitions) ? source.layerDefinitions : [];
  if (layerDefinitions.length === 0) {
    throw new Error(`Data source "${source.label}" does not define any runtime layers.`);
  }

  return {
    sourceId: source.id,
    identities,
    products: normalizedFeatures.map((feature) => feature.properties),
    layers: layerDefinitions.map((definition) => ({
      layerId: definition.id,
      data,
    })),
  };
}

function resolveDatasetName({ rawProperties, productKey, featureIndex, source }) {
  const rawDatasetName =
    normalizeText(readFirstDefined(rawProperties, ["datasetName", "productName", "name"])) ??
    productKey;
  const strategy = source?.normalizer?.datasetNameStrategy;

  if (!strategy) {
    return rawDatasetName;
  }

  const identitySeed = stripDevelopmentDisplaySuffix(rawDatasetName ?? productKey);
  switch (strategy.type) {
    case "replace-leading-product-code":
      return replaceLeadingProductCode(identitySeed, productKey, strategy, featureIndex);
    case "synthetic-prefix":
      return createSyntheticDatasetName(identitySeed ?? productKey, strategy.prefix, featureIndex);
    default:
      throw new Error(
        `Unsupported dataset name strategy "${strategy.type ?? "unknown"}" for data source "${
          source?.label ?? source?.id ?? "unknown"
        }".`
      );
  }
}

function replaceLeadingProductCode(identitySeed, productKey, strategy, featureIndex) {
  const productCode = normalizeText(strategy.productCode);
  if (!productCode) {
    throw new Error("A replace-leading-product-code strategy requires productCode.");
  }

  if (/^\d{3}/.test(identitySeed ?? "")) {
    return `${productCode}${identitySeed.slice(3)}`;
  }

  return createSyntheticDatasetName(
    productKey,
    normalizeText(strategy.fallbackPrefix) ?? `${productCode}-MOCK`,
    featureIndex
  );
}

function createSyntheticDatasetName(value, prefix, featureIndex) {
  const normalizedPrefix = normalizeText(prefix);
  if (!normalizedPrefix) {
    throw new Error("A synthetic-prefix dataset name strategy requires prefix.");
  }

  const token = createSyntheticDatasetToken(value) ?? String(featureIndex + 1).padStart(4, "0");
  return `${normalizedPrefix}-${token}`;
}

function createSyntheticDatasetToken(value) {
  const normalized = stripDevelopmentDisplaySuffix(normalizeText(value));
  if (!normalized) {
    return null;
  }

  const token = normalized
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return token || null;
}

function stripDevelopmentDisplaySuffix(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  // The legacy Development fixtures used parenthesized source labels for visual
  // disambiguation. Dataset identity must stay independent of those UI labels.
  return normalized.replace(/\s+\((?:S-?102|Paper Charts)\)\s*$/i, "").trim();
}

function readGeoJsonFeatures(rawPayload, source) {
  if (Array.isArray(rawPayload)) {
    return rawPayload;
  }

  if (Array.isArray(rawPayload?.features)) {
    return rawPayload.features;
  }

  const sourceLabel = source?.label ?? source?.id ?? "unknown";
  throw new Error(
    `Data source "${sourceLabel}" returned an invalid GeoJSON payload. ` +
      "Expected a FeatureCollection."
  );
}

function isFeatureCollection(value) {
  return value?.type === "FeatureCollection" && Array.isArray(value.features);
}

function readProperties(feature) {
  const properties = feature?.properties ?? feature?.attributes ?? {};
  return properties && typeof properties === "object" ? properties : {};
}

function readFirstDefined(source, names) {
  const normalizedNames = new Set(names.map(normalizePropertyName));

  for (const [name, value] of Object.entries(source ?? {})) {
    if (normalizedNames.has(normalizePropertyName(name)) && value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function normalizePropertyName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function compactUndefinedValues(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
