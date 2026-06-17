import {
  AOI_FIELD,
  AOI_ID_FIELD_CANDIDATES,
  AOI_NAME_FIELD_CANDIDATES,
} from "../config/aoiFieldConfig.js";

const DEFAULT_AOI_JOB_SUMMARY = Object.freeze({
  total: 0,
  active: 0,
  highPriority: 0,
});

export function normalizeAoi(rawAoi) {
  const attributes = normalizeAttributes(rawAoi?.attributes);
  const globalId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.GLOBAL_ID);
  const objectId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.OBJECT_ID);
  const productId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.PRODUCT_ID);
  const name = resolveFirstStringValue(rawAoi, attributes, AOI_NAME_FIELD_CANDIDATES);
  const id = resolveFirstStringValue(rawAoi, attributes, AOI_ID_FIELD_CANDIDATES);

  return {
    id: id || createFallbackAoiId({ globalId, productId, objectId }),
    name: name || "Unnamed Area of Interest",
    objectId,
    globalId,
    productId,
    series: resolveFieldValue(rawAoi, attributes, AOI_FIELD.SERIES),
    edition: normalizeNullableInteger(resolveFieldValue(rawAoi, attributes, AOI_FIELD.EDITION)),
    geometry: rawAoi?.geometry ?? null,
    attributes,
    jobSummary: normalizeAoiJobSummary(rawAoi?.jobSummary),
  };
}

export function normalizeAoiJobSummary(jobSummary) {
  if (!jobSummary || typeof jobSummary !== "object") {
    return { ...DEFAULT_AOI_JOB_SUMMARY };
  }

  return {
    total: normalizeCount(jobSummary.total),
    active: normalizeCount(jobSummary.active),
    highPriority: normalizeCount(jobSummary.highPriority),
  };
}

function normalizeAttributes(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return {};
  }

  return { ...attributes };
}

function resolveFirstStringValue(rawAoi, attributes, candidateKeys) {
  for (const key of candidateKeys) {
    const value = resolveFieldValue(rawAoi, attributes, key);

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveFieldValue(rawAoi, attributes, fieldName) {
  return normalizeOptionalString(rawAoi?.[fieldName] ?? attributes[fieldName]);
}

function createFallbackAoiId({ globalId, productId, objectId }) {
  if (globalId) {
    return globalId;
  }

  if (productId) {
    return productId;
  }

  if (objectId) {
    return `aoi-${objectId}`;
  }

  return "aoi-unknown";
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.trunc(numberValue);
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}
