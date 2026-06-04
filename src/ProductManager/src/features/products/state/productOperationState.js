export const PRODUCT_OPERATION_TYPE = Object.freeze({
  FREEZE: "freeze",
  UNFREEZE: "unfreeze",
  SEND: "send",
  EXPORT: "export",
  ROLLBACK: "rollback",
});

const PRODUCT_OPERATION_STATE_CHANGED_EVENT = "pm:product-operation-state-changed";

const PRODUCT_OPERATION_LABELS = Object.freeze({
  [PRODUCT_OPERATION_TYPE.FREEZE]: "Freeze",
  [PRODUCT_OPERATION_TYPE.UNFREEZE]: "Unfreeze",
  [PRODUCT_OPERATION_TYPE.SEND]: "Send",
  [PRODUCT_OPERATION_TYPE.EXPORT]: "Export",
  [PRODUCT_OPERATION_TYPE.ROLLBACK]: "Rollback",
});

const activeOperationsByDatasetName = new Map();

export function beginProductOperation({
  datasetName,
  type,
  label,
  operationId,
  allowConcurrentSameType = false,
} = {}) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);
  const normalizedType = normalizeOperationType(type);

  if (!normalizedDatasetName || !normalizedType) {
    return {
      started: false,
      key: null,
      operation: null,
      reason: "Product operation is missing required data.",
    };
  }

  const operations = getOperationsForDataset(normalizedDatasetName);
  const existingOperation = findBlockingOperation(operations, {
    type: normalizedType,
    allowConcurrentSameType,
  });

  if (existingOperation) {
    return {
      started: false,
      key: null,
      operation: existingOperation,
      reason: `${formatProductOperation(existingOperation)} is already running for ${existingOperation.datasetName}.`,
    };
  }

  const normalizedOperationId =
    normalizeOperationId(operationId) ?? createDefaultOperationId(normalizedType);
  const key = `${normalizedDatasetName}:${normalizedType}:${normalizedOperationId}`;

  if (operations.has(key)) {
    const duplicateOperation = operations.get(key);

    return {
      started: false,
      key: null,
      operation: duplicateOperation,
      reason: `${formatProductOperation(duplicateOperation)} is already running for ${duplicateOperation.datasetName}.`,
    };
  }

  const operation = {
    key,
    operationId: normalizedOperationId,
    datasetName,
    normalizedDatasetName,
    type: normalizedType,
    label: label ?? getProductOperationTypeLabel(normalizedType),
    startedAt: Date.now(),
  };

  operations.set(operation.key, operation);
  activeOperationsByDatasetName.set(normalizedDatasetName, operations);
  emitProductOperationStateChanged(operation.datasetName);

  return {
    started: true,
    key: operation.key,
    operation,
    reason: null,
  };
}

export function endProductOperation(key) {
  if (!key) {
    return;
  }

  for (const [normalizedDatasetName, operations] of activeOperationsByDatasetName.entries()) {
    const operation = operations.get(key);

    if (!operation) {
      continue;
    }

    operations.delete(key);

    if (operations.size === 0) {
      activeOperationsByDatasetName.delete(normalizedDatasetName);
    }

    emitProductOperationStateChanged(operation.datasetName);
    return;
  }
}

export function getProductOperationState(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);
  const operations = normalizedDatasetName
    ? getSortedOperations(activeOperationsByDatasetName.get(normalizedDatasetName))
    : [];
  const primaryOperation = operations[0] ?? null;

  return {
    running: operations.length > 0,
    operation: primaryOperation,
    operations,
    disabledReason: primaryOperation ? createDisabledReason(primaryOperation, operations) : null,
  };
}

export function isProductOperationRunning(datasetName) {
  return getProductOperationState(datasetName).running;
}

export function onProductOperationStateChanged(callback) {
  const handler = (event) => {
    callback?.(event.detail);
  };

  document.addEventListener(PRODUCT_OPERATION_STATE_CHANGED_EVENT, handler);

  return () => {
    document.removeEventListener(PRODUCT_OPERATION_STATE_CHANGED_EVENT, handler);
  };
}

export function getProductOperationTypeLabel(type) {
  return PRODUCT_OPERATION_LABELS[type] ?? "Product operation";
}

function getOperationsForDataset(normalizedDatasetName) {
  return activeOperationsByDatasetName.get(normalizedDatasetName) ?? new Map();
}

function findBlockingOperation(operations, { type, allowConcurrentSameType } = {}) {
  for (const operation of operations.values()) {
    if (allowConcurrentSameType && operation.type === type) {
      continue;
    }

    return operation;
  }

  return null;
}

function getSortedOperations(operations) {
  if (!operations) {
    return [];
  }

  return Array.from(operations.values()).sort((left, right) => {
    return left.startedAt - right.startedAt;
  });
}

function createDisabledReason(primaryOperation, operations) {
  if (operations.length > 1) {
    return `Multiple product operations are already running for ${primaryOperation.datasetName}.`;
  }

  return `${formatProductOperation(primaryOperation)} is already running for ${primaryOperation.datasetName}.`;
}

function formatProductOperation(operation) {
  return operation?.label ?? getProductOperationTypeLabel(operation?.type);
}

function emitProductOperationStateChanged(datasetName) {
  document.dispatchEvent(
    new CustomEvent(PRODUCT_OPERATION_STATE_CHANGED_EVENT, {
      detail: {
        datasetName,
      },
    })
  );
}

function createDefaultOperationId(type) {
  return type;
}

function normalizeDatasetName(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toUpperCase();

  return normalizedValue || null;
}

function normalizeOperationType(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  if (Object.values(PRODUCT_OPERATION_TYPE).includes(normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

function normalizeOperationId(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  return normalizedValue || null;
}
