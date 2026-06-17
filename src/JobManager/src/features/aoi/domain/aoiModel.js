const DEFAULT_AOI_JOB_SUMMARY = Object.freeze({
  total: 0,
  active: 0,
  highPriority: 0,
});

const AOI_ID_FIELD_CANDIDATES = Object.freeze([
  "id",
  "aoiId",
  "aoi_id",
  "globalId",
  "GlobalID",
  "OBJECTID",
  "ObjectID",
  "objectid",
]);

const AOI_NAME_FIELD_CANDIDATES = Object.freeze([
  "name",
  "Name",
  "title",
  "Title",
  "aoiName",
  "aoi_name",
]);

export function normalizeAoi(rawAoi) {
  const attributes = normalizeAttributes(rawAoi?.attributes);
  const id = resolveFirstStringValue(rawAoi, attributes, AOI_ID_FIELD_CANDIDATES);

  return {
    id: id || createFallbackAoiId(attributes),
    name:
      resolveFirstStringValue(rawAoi, attributes, AOI_NAME_FIELD_CANDIDATES) ||
      "Unnamed Area of Interest",
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
    const value = rawAoi?.[key] ?? attributes[key];
    const normalizedValue = normalizeOptionalString(value);

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
}

function createFallbackAoiId(attributes) {
  const objectId = normalizeOptionalString(
    attributes.OBJECTID ?? attributes.ObjectID ?? attributes.objectid
  );

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

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}
