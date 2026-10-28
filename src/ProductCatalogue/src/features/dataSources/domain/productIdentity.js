const DEFAULT_IDENTITY_FIELDS = Object.freeze([
  "productKey",
  "datasetName",
  "productName",
  "OBJECTID",
  "id",
]);

export function resolveStableProductKey(feature, identityStrategy = {}, context = {}) {
  const properties = getFeatureProperties(feature);
  const fields = identityStrategy.fields ?? DEFAULT_IDENTITY_FIELDS;

  for (const fieldName of fields) {
    const value = readProperty(properties, fieldName);
    const normalizedValue = normalizeIdentityPart(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  if (identityStrategy.allowFeatureId !== false) {
    const featureId = normalizeIdentityPart(feature?.id);
    if (featureId) {
      return featureId;
    }
  }

  throw new Error(createMissingIdentityMessage(context, fields));
}

export function createSourceAwareProductIdentity(sourceId, productKey) {
  const normalizedSourceId = normalizeIdentityPart(sourceId);
  const normalizedProductKey = normalizeIdentityPart(productKey);

  if (!normalizedSourceId || !normalizedProductKey) {
    throw new Error("A source-aware product identity requires both sourceId and productKey.");
  }

  return Object.freeze({
    sourceId: normalizedSourceId,
    productKey: normalizedProductKey,
  });
}

export function serializeProductIdentity(identity) {
  const normalizedIdentity = createSourceAwareProductIdentity(
    identity?.sourceId,
    identity?.productKey
  );

  return JSON.stringify([normalizedIdentity.sourceId, normalizedIdentity.productKey]);
}

export function assertUniqueProductIdentities(identities, { sourceId, sourceLabel } = {}) {
  const seen = new Set();

  for (const identity of identities) {
    const serializedIdentity = serializeProductIdentity(identity);
    if (seen.has(serializedIdentity)) {
      const label =
        normalizeIdentityPart(sourceLabel) ?? normalizeIdentityPart(sourceId) ?? "unknown";
      throw new Error(
        `Data source "${label}" contains duplicate product identity ${serializedIdentity}.`
      );
    }

    seen.add(serializedIdentity);
  }
}

function createMissingIdentityMessage(context, fields) {
  const sourceLabel = normalizeIdentityPart(context.sourceLabel) ?? "Unknown source";
  const sourceId = normalizeIdentityPart(context.sourceId) ?? "unknown";
  const featureContext = Number.isInteger(context.featureIndex)
    ? `feature at index ${context.featureIndex}`
    : "feature";

  return `Data source "${sourceLabel}" (${sourceId}) ${featureContext} is missing a stable product identity. Expected one of: ${fields.join(
    ", "
  )}, feature.id.`;
}

function getFeatureProperties(feature) {
  return (
    feature?.properties ?? feature?.attributes ?? feature?.Properties ?? feature?.Attributes ?? {}
  );
}

function readProperty(properties, requestedName) {
  if (Object.hasOwn(properties, requestedName)) {
    return properties[requestedName];
  }

  const normalizedRequestedName = normalizePropertyName(requestedName);
  for (const [name, value] of Object.entries(properties)) {
    if (normalizePropertyName(name) === normalizedRequestedName) {
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

function normalizeIdentityPart(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}
