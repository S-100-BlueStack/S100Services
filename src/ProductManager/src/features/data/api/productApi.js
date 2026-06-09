import { apiRequest } from "../../../shared/api/apiClient.js";
import { getApiResultErrorMessage } from "../../../shared/api/apiResult.js";

const PRODUCT_MUTATION_TIMEOUT_MS = 30 * 1000;
const SELECTED_PRODUCT_REFRESH_TIMEOUT_MS = 15 * 1000;

export async function uploadProduct(datasetName) {
  return apiRequest(`upload/${encodeURIComponent(datasetName)}`, {
    method: "PUT",
  });
}

export async function changeFreezeState(datasetName, state) {
  const action = state === true ? "freeze" : "unfreeze";

  return apiRequest(`upload/${encodeURIComponent(datasetName)}/${action}`, {
    method: "PUT",
    timeoutMs: PRODUCT_MUTATION_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function fetchProductPropertiesByDatasetName(datasetName) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot refresh selected product without a datasetName.",
    };
  }

  const result = await apiRequest(`electronicproducts/${encodeURIComponent(datasetName)}`, {
    method: "GET",
    timeoutMs: SELECTED_PRODUCT_REFRESH_TIMEOUT_MS,
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!result.success) {
    return {
      ...result,
      errorMessage: getApiResultErrorMessage(result, "Selected product refresh failed"),
    };
  }
  return {
    ...result,
    data: normalizeElectronicProductResponse(result.data),
  };
}

function normalizeElectronicProductResponse(data) {
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
