export const PRODUCT_EXPORT_STANDARD = Object.freeze({
  S100: "S100",
  S57: "S57",
});

const DEFAULT_STANDARD_ORDER = [PRODUCT_EXPORT_STANDARD.S100, PRODUCT_EXPORT_STANDARD.S57];

export function normalizeProductExportMetadata(exportsValue) {
  const items = getExportRecords(exportsValue).map(normalizeProductExportRecord).filter(Boolean);
  const byStandard = groupExportsByStandard(items);

  return {
    items,
    byStandard,
    standards: getOrderedStandards(byStandard),
  };
}

export function hasProductExportMetadata(exportMetadata) {
  return Boolean(exportMetadata?.standards?.length);
}

function getExportRecords(exportsValue) {
  if (!exportsValue) {
    return [];
  }

  if (Array.isArray(exportsValue)) {
    return exportsValue.filter((item) => item && typeof item === "object");
  }

  if (typeof exportsValue === "object") {
    return [exportsValue];
  }

  return [];
}

function normalizeProductExportRecord(record) {
  const rawType = readFirstDefined(record, ["type", "Type", "standard", "Standard"]);
  const standard = normalizeExportStandard(rawType);

  if (!standard) {
    return null;
  }

  return {
    standard,
    type: rawType,
    label: standard,
    datasetName: readFirstDefined(record, ["datasetName", "DatasetName", "name", "Name"]),
    edition: readFirstDefined(record, ["edition", "Edition"]),
    update: readFirstDefined(record, ["update", "Update"]),
    status: readFirstDefined(record, ["status", "Status"]),
    date: readFirstDefined(record, ["date", "Date"]),
    errorMessage: readFirstDefined(record, ["errorMessage", "ErrorMessage"]),
    validationArtifacts: normalizeValidationArtifacts(readFirstDefined(record, ["validationArtifacts", "ValidationArtifacts"])),
    raw: record,
  };
}

function normalizeValidationArtifacts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((artifact) => artifact && typeof artifact === "object")
    .map((artifact) => ({
      id: readFirstDefined(artifact, ["id", "Id"]),
      fileName: readFirstDefined(artifact, ["fileName", "FileName"]),
      mediaType: readFirstDefined(artifact, ["mediaType", "MediaType"]),
      createdAtUtc: readFirstDefined(artifact, ["createdAtUtc", "CreatedAtUtc"]),
      url: readFirstDefined(artifact, ["url", "Url"]),
    }))
    .filter((artifact) => artifact.url);
}

function groupExportsByStandard(items) {
  return items.reduce((result, item) => {
    const existing = result[item.standard];

    if (!existing || shouldPreferExport(item, existing)) {
      result[item.standard] = item;
    }

    return result;
  }, {});
}

function shouldPreferExport(candidate, existing) {
  const candidateTime = getDateTimeValue(candidate.date);
  const existingTime = getDateTimeValue(existing.date);

  if (candidateTime === null && existingTime === null) {
    return false;
  }

  if (candidateTime === null) {
    return false;
  }

  if (existingTime === null) {
    return true;
  }

  return candidateTime >= existingTime;
}

function getOrderedStandards(byStandard) {
  const knownStandards = DEFAULT_STANDARD_ORDER.filter((standard) => byStandard[standard]);
  const unknownStandards = Object.keys(byStandard)
    .filter((standard) => !DEFAULT_STANDARD_ORDER.includes(standard))
    .sort();

  return [...knownStandards, ...unknownStandards];
}

function normalizeExportStandard(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/[\s_-]/g, "")
    .toUpperCase();

  if (text === "S100") {
    return PRODUCT_EXPORT_STANDARD.S100;
  }

  if (text === "S57") {
    return PRODUCT_EXPORT_STANDARD.S57;
  }

  return text || null;
}

function getDateTimeValue(value) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function readFirstDefined(source, keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}
