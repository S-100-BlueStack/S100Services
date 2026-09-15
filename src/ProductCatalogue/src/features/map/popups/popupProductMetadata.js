import { findProductExportMetadataItem } from "../../products/domain/productExportTrack.js";

export function createPopupProductMetadataColumns(attributes) {
  const selectedExport = findSelectedExport(attributes);
  const main = createMainProductMetadataItem(attributes);
  const item = selectedExport ? mergeSelectedExport(main, selectedExport) : main;

  return [
    {
      key: "main",
      label: attributes?.sourceLabel ?? selectedExport?.label ?? "Product",
      item,
    },
  ];
}

function createMainProductMetadataItem(attributes) {
  return {
    edition: readAttribute(attributes, ["edition", "Edition"]),
    update: readAttribute(attributes, ["update", "Update"]),
    status: readAttribute(attributes, ["status", "Status"]),
    date: readAttribute(attributes, ["issueDate", "IssueDate"]),
    errorMessage: readAttribute(attributes, ["errorMessage", "ErrorMessage"]),
    validationArtifacts: [],
  };
}

function findSelectedExport(attributes) {
  return findProductExportMetadataItem(attributes?.exportMetadata, [
    attributes?.sourceLabel,
    attributes?.sourceId,
    attributes?.productType,
  ]);
}

function mergeSelectedExport(main, selectedExport) {
  return {
    edition: selectedExport.edition ?? main.edition,
    update: selectedExport.update ?? main.update,
    status: selectedExport.status ?? main.status,
    date: selectedExport.date ?? main.date,
    errorMessage: selectedExport.errorMessage ?? main.errorMessage,
    validationArtifacts: selectedExport.validationArtifacts ?? [],
  };
}

function readAttribute(attributes, names) {
  if (!attributes) {
    return undefined;
  }

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      return attributes[name];
    }
  }

  const normalizedNames = new Set(names.map(normalizeAttributeName));
  for (const [name, value] of Object.entries(attributes)) {
    if (normalizedNames.has(normalizeAttributeName(name))) {
      return value;
    }
  }

  return undefined;
}

function normalizeAttributeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}
