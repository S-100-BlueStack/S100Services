import { apiRequest } from "../../../shared/api/apiClient.js";

export async function uploadProduct(datasetName) {
  return apiRequest(encodeURIComponent(datasetName), {
    method: "PUT",
  });
}

export async function changeFreezeState(datasetName, state) {
  const action = state === true ? "freeze" : "unfreeze";

  return apiRequest(`upload/${encodeURIComponent(datasetName)}/${action}`, {
    method: "PUT",
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
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!result.success) {
    return {
      ...result,
      errorMessage: getProductRequestErrorMessage("Selected product refresh failed", result),
    };
  }

  return {
    ...result,
    data: normalizeElectronicProductResponse(result.data),
  };
}

function normalizeElectronicProductResponse(data) {
  const attributes = findElectronicProductAttributes(data);

  return attributes ?? {};
}

function findElectronicProductAttributes(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(findElectronicProductAttributes).find(Boolean) ?? null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const directAttributes = value.properties ?? value.attributes ?? value;

  if (hasProductAttributeShape(directAttributes)) {
    return directAttributes;
  }

  return (
    findElectronicProductAttributes(value.data) ??
    findElectronicProductAttributes(value.result) ??
    findElectronicProductAttributes(value.product) ??
    findElectronicProductAttributes(value.electronicProduct) ??
    findElectronicProductAttributes(value.item) ??
    findElectronicProductAttributes(value.value)
  );
}

function hasProductAttributeShape(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    Object.hasOwn(value, "datasetName") ||
    Object.hasOwn(value, "DatasetName") ||
    Object.hasOwn(value, "status") ||
    Object.hasOwn(value, "Status") ||
    Object.hasOwn(value, "productState") ||
    Object.hasOwn(value, "ProductState")
  );
}

function getProductRequestErrorMessage(defaultMessage, result) {
  if (result.networkError) {
    return result.errorMessage ?? defaultMessage;
  }

  if (typeof result.data === "string" && result.data.trim()) {
    return `${defaultMessage}: ${result.data}`;
  }

  return `${defaultMessage}${result.status ? ` (${result.status})` : ""}${
    result.statusText ? ` ${result.statusText}` : ""
  }`;
}
