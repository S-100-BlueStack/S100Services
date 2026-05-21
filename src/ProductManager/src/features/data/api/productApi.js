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

  const normalizedData = normalizeElectronicProductResponse(result.data, datasetName);

  return {
    ...result,
    data: normalizedData,
  };

  return {
    ...result,
    data: normalizeElectronicProductResponse(result.data, datasetName),
  };
}

function normalizeElectronicProductResponse(data, datasetName) {
  const attributes = findElectronicProductAttributes(data, datasetName);

  return attributes ?? {};
}

function findElectronicProductAttributes(value, datasetName) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    const candidates = value
      .map((item) => findElectronicProductAttributes(item, datasetName))
      .filter(Boolean);

    return findMatchingDataset(candidates, datasetName) ?? candidates[0] ?? null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const directAttributes = value.properties ?? value.attributes ?? value;

  if (hasProductAttributeShape(directAttributes)) {
    return directAttributes;
  }

  const nestedCandidates = [
    value.feature,
    value.Feature,
    value.features,
    value.Features,
    value.data,
    value.Data,
    value.result,
    value.Result,
    value.product,
    value.Product,
    value.products,
    value.Products,
    value.electronicProduct,
    value.ElectronicProduct,
    value.electronicProducts,
    value.ElectronicProducts,
    value.item,
    value.Item,
    value.items,
    value.Items,
    value.value,
    value.Value,
  ];

  for (const candidate of nestedCandidates) {
    const attributes = findElectronicProductAttributes(candidate, datasetName);

    if (attributes) {
      return attributes;
    }
  }

  return null;
}

function findMatchingDataset(candidates, datasetName) {
  if (!datasetName) {
    return null;
  }

  return (
    candidates.find((attributes) => {
      return normalizeDatasetName(getDatasetName(attributes)) === normalizeDatasetName(datasetName);
    }) ?? null
  );
}

function getDatasetName(attributes) {
  return (
    attributes?.datasetName ??
    attributes?.DatasetName ??
    attributes?.datasetname ??
    attributes?.name ??
    attributes?.Name
  );
}

function normalizeDatasetName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function hasProductAttributeShape(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    Object.hasOwn(value, "datasetName") ||
    Object.hasOwn(value, "DatasetName") ||
    Object.hasOwn(value, "datasetname") ||
    Object.hasOwn(value, "edition") ||
    Object.hasOwn(value, "Edition") ||
    Object.hasOwn(value, "update") ||
    Object.hasOwn(value, "Update") ||
    Object.hasOwn(value, "status") ||
    Object.hasOwn(value, "Status") ||
    Object.hasOwn(value, "state") ||
    Object.hasOwn(value, "State") ||
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
