import { normalizeProductExportMetadata } from "./productExportMetadata.js";
import { normalizeWorkUnitMetadata } from "./workUnitMetadata.js";

export function normalizeElectronicProductResponse(data) {
  const product = findElectronicProductPayload(data);

  if (!product) {
    return {};
  }
  return {
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
