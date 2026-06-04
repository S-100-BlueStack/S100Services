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

export function beginProductOperation({ datasetName, type, label } = {}) {
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

  const existingOperation = activeOperationsByDatasetName.get(normalizedDatasetName);

  if (existingOperation) {
    return {
      started: false,
      key: null,
      operation: existingOperation,
      reason: `${formatProductOperation(existingOperation)} is already running for ${existingOperation.datasetName}.`,
    };
  }

  const operation = {
    key: `${normalizedDatasetName}:${normalizedType}`,
    datasetName,
    normalizedDatasetName,
    type: normalizedType,
    label: label ?? getProductOperationTypeLabel(normalizedType),
    startedAt: Date.now(),
  };

  activeOperationsByDatasetName.set(normalizedDatasetName, operation);
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

  for (const [normalizedDatasetName, operation] of activeOperationsByDatasetName) {
    if (operation.key !== key) {
      continue;
    }

    activeOperationsByDatasetName.delete(normalizedDatasetName);
    emitProductOperationStateChanged(operation.datasetName);
    return;
  }
}

export function getProductOperationState(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);
  const operation = normalizedDatasetName
    ? (activeOperationsByDatasetName.get(normalizedDatasetName) ?? null)
    : null;

  return {
    running: Boolean(operation),
    operation,
    disabledReason: operation
      ? `${formatProductOperation(operation)} is already running for ${operation.datasetName}.`
      : null,
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
