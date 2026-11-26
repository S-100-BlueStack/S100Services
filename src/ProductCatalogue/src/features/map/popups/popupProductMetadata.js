import { findProductExportMetadataItem } from "../../products/domain/productExportTrack.js";
import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";
import { findPackageStatusMember } from "../../dataSources/domain/encPackageStatusObservation.js";

export function createPopupProductMetadataColumns(attributes, productContext) {
  const workUnit = productContext?.workUnit;
  if (workUnit?.kind === "package") {
    return workUnit.members.map((member) => {
      const current = attributes?.workUnitMetadata?.members?.[member.key];
      const state = findPackageStatusMember(
        attributes?.workUnitStatus?.members,
        member.key,
        current?.datasetName
      );
      const main = {
        datasetName: current?.datasetName,
        edition: current?.edition,
        update: current?.update,
        date: current?.issueDate,
        status: normalizeElectronicProductStatus(state?.status),
        errorMessage: state?.errorMessage,
        validationArtifacts: [],
      };
      const related = findProductExportMetadataItem(attributes?.exportMetadata, [
        member.exportStandard,
      ]);
      return {
        key: member.key,
        label: member.label,
        presentation: { statusCell: true, compactError: true, productIdentity: true },
        item:
          related && (!related.datasetName || related.datasetName === current?.datasetName)
            ? {
                ...main,
                edition: related.edition ?? main.edition,
                update: related.update ?? main.update,
                date: related.date ?? main.date,
                validationArtifacts: related.validationArtifacts ?? [],
              }
            : main,
      };
    });
  }

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
