export const PRODUCT_EXPORT_STANDARD = Object.freeze({
  S100: "S100",
  S57: "S57",
});

const KNOWN_PRODUCT_EXPORT_STANDARDS = new Set(Object.values(PRODUCT_EXPORT_STANDARD));

export function normalizeProductExportStandard(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/[\s_-]/g, "")
    .toUpperCase();

  if (text === "S100" || text === "S101") {
    return PRODUCT_EXPORT_STANDARD.S100;
  }

  if (text === "S57") {
    return PRODUCT_EXPORT_STANDARD.S57;
  }

  return text || null;
}

export function createProductExportStandardLabel(standard) {
  return standard === PRODUCT_EXPORT_STANDARD.S100
    ? "S-101"
    : standard === PRODUCT_EXPORT_STANDARD.S57
      ? "S-57"
      : standard;
}

export function findProductExportMetadataItem(exportMetadata, standardCandidates = []) {
  const candidates = Array.isArray(standardCandidates) ? standardCandidates : [standardCandidates];

  for (const candidate of candidates) {
    const standard = normalizeProductExportStandard(candidate);
    if (!KNOWN_PRODUCT_EXPORT_STANDARDS.has(standard)) {
      continue;
    }

    const item = exportMetadata?.byStandard?.[standard];
    if (item) {
      return item;
    }
  }

  return null;
}
