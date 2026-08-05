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
    const datasetName =
      readFirstDefined(rawProperties, ["datasetName", "productName", "name"]) ?? productKey;

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
