import { PRODUCT_OPERATION_SOURCE } from "../state/productOperationState.js";

const PRODUCT_OPERATION_ENDPOINT_AVAILABLE = false;

export async function fetchProductOperationState(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    return {
      endpointAvailable: PRODUCT_OPERATION_ENDPOINT_AVAILABLE,
      datasetName: null,
      operations: [],
    };
  }

  return {
    endpointAvailable: PRODUCT_OPERATION_ENDPOINT_AVAILABLE,
    datasetName,
    operations: [],
  };
}

export function normalizeBackendProductOperationsResponse(response, fallbackDatasetName) {
  const datasetName =
    normalizeDatasetName(response?.datasetName) ?? normalizeDatasetName(fallbackDatasetName);

  return {
    endpointAvailable: Boolean(response?.endpointAvailable),
    datasetName,
    operations: normalizeBackendOperations(response?.operations, datasetName),
  };
}

function normalizeBackendOperations(operations, datasetName) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations
    .map((operation) => normalizeBackendOperation(operation, datasetName))
    .filter(Boolean);
}

function normalizeBackendOperation(operation, datasetName) {
  if (!operation || typeof operation !== "object") {
    return null;
  }

  return {
    id: normalizeText(operation.id ?? operation.operationId),
    datasetName: normalizeDatasetName(operation.datasetName) ?? datasetName,
    type: normalizeText(operation.type),
    label: normalizeText(operation.label),
    startedAt: normalizeText(operation.startedAt),
    startedBy: normalizeText(operation.startedBy),
    source: PRODUCT_OPERATION_SOURCE.BACKEND,
  };
}

function normalizeDatasetName(value) {
  const text = normalizeText(value);

  return text || null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();

  return text || null;
}
