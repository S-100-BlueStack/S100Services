import { normalizeProductExportMetadata } from "./productExportMetadata.js";
import { normalizeWorkUnitMetadata } from "./workUnitMetadata.js";
import { normalizeEncPackageStatus } from "../../dataSources/domain/encPackageStatus.js";
import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";
import { normalizePackageStatusMessage } from "../../dataSources/domain/encPackageStatusObservation.js";

const ENC_MEMBERS = [
  { key: "s101", field: "S101", specification: 1 },
  { key: "s57", field: "S57", specification: 0 },
];

export function normalizeElectronicProductResponse(data) {
  const product = findElectronicProductPayload(data);

  if (!product) {
    return {};
  }
  const packagePayload = readFirstDefined(product, ["package", "Package"]);
  const packageStatus = normalizeEncPackageStatus(
    packagePayload
      ? readFirstDefined(packagePayload, ["status", "Status"])
      : product.packageStatusObservation?.status
  );
  const packageStatusObservation = packagePayload
    ? normalizePackageDetailStatus(packagePayload, packageStatus)
    : product.packageStatusObservation;
  return {
    ...(packageStatus !== undefined ? { packageStatus } : {}),
    ...(packageStatusObservation ? { packageStatusObservation } : {}),
    datasetName: readFirstDefined(product, ["datasetName", "DatasetName", "name", "Name"]),
    edition: readFirstDefined(product, ["edition", "Edition"]),
    update: readFirstDefined(product, ["update", "Update", "updateNumber", "UpdateNumber"]),
    issueDate: readFirstDefined(product, ["issueDate", "IssueDate"]),
    usageBand: readFirstDefined(product, ["usageBand", "UsageBand"]),
    aoi: readFirstDefined(product, ["aoi", "Aoi"]),
    status: readFirstDefined(product, ["status", "Status", "productState", "ProductState"]),
    displayScale: readFirstDefined(product, [
      "displayScale",
      "DisplayScale",
      "optimumDisplayScale",
      "OptimumDisplayScale",
    ]),
    errorMessage: readFirstDefined(product, ["errorMessage", "ErrorMessage"]),
    workUnitMetadata: normalizeWorkUnitMetadata(product, [
      { key: "s101", field: "s101" },
      { key: "s57", field: "s57" },
    ]),
    exportMetadata: normalizeProductExportMetadata(
      readFirstDefined(product, ["exports", "Exports"])
    ),
  };
}

function normalizePackageDetailStatus(payload, status) {
  if (typeof payload !== "object" || Array.isArray(payload)) return null;

  const layer = readFirstDefined(payload, ["layer", "Layer"]);
  if (layer !== undefined && layer !== 1 && layer !== "ENC") return null;

  const members = {};
  for (const { key, field, specification } of ENC_MEMBERS) {
    const member = readFirstDefined(payload, [key, field]);
    if (!member || typeof member !== "object" || Array.isArray(member)) continue;
    const observedSpecification = readFirstDefined(member, [
      "productSpecification",
      "ProductSpecification",
    ]);
    if (observedSpecification !== undefined && observedSpecification !== specification) {
      return null;
    }
    members[key] = {
      datasetName: readFirstDefined(member, ["datasetName", "DatasetName"]),
      status: normalizeElectronicProductStatus(readFirstDefined(member, ["status", "Status"])),
      errorMessage: readStatusMessage(member),
    };
  }
  return {
    sourceDatasetName: readFirstDefined(payload, ["sourceDatasetName", "SourceDatasetName"]),
    status,
    errorMessage: readStatusMessage(payload),
    members,
  };
}

function readStatusMessage(payload) {
  // A nullable message is evidence of clearing. An omitted field is no observation.
  const value = Object.hasOwn(payload, "errorMessage")
    ? payload.errorMessage
    : payload.ErrorMessage;
  return normalizePackageStatusMessage(value);
}

function findElectronicProductPayload(value) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(findElectronicProductPayload).find(Boolean) ?? null;
  }
  if (typeof value !== "object") {
    return null;
  }
  if (hasProductPayloadShape(value)) {
    return value;
  }
  return (
    findElectronicProductPayload(value.data) ??
    findElectronicProductPayload(value.Data) ??
    findElectronicProductPayload(value.result) ??
    findElectronicProductPayload(value.Result) ??
    findElectronicProductPayload(value.product) ??
    findElectronicProductPayload(value.Product) ??
    findElectronicProductPayload(value.electronicProduct) ??
    findElectronicProductPayload(value.ElectronicProduct) ??
    findElectronicProductPayload(value.item) ??
    findElectronicProductPayload(value.Item) ??
    findElectronicProductPayload(value.value) ??
    findElectronicProductPayload(value.Value)
  );
}

function hasProductPayloadShape(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    Object.hasOwn(value, "datasetName") ||
    Object.hasOwn(value, "DatasetName") ||
    Object.hasOwn(value, "name") ||
    Object.hasOwn(value, "Name") ||
    Object.hasOwn(value, "status") ||
    Object.hasOwn(value, "Status") ||
    Object.hasOwn(value, "productState") ||
    Object.hasOwn(value, "ProductState")
  );
}

function readFirstDefined(source, keys) {
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}
