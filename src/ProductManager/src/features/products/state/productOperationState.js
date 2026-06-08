export const PRODUCT_OPERATION_TYPE = Object.freeze({
  FREEZE: "freeze",
  UNFREEZE: "unfreeze",
  SEND: "send",
  EXPORT: "export",
  ROLLBACK: "rollback",
});

export const PRODUCT_OPERATION_SOURCE = Object.freeze({
  LOCAL: "local",
  BACKEND: "backend",
});

const PRODUCT_OPERATION_STATE_CHANGED_EVENT = "pm:product-operation-state-changed";

const PRODUCT_OPERATION_LABELS = Object.freeze({
  [PRODUCT_OPERATION_TYPE.FREEZE]: "Freeze",
  [PRODUCT_OPERATION_TYPE.UNFREEZE]: "Unfreeze",
  [PRODUCT_OPERATION_TYPE.SEND]: "Send",
  [PRODUCT_OPERATION_TYPE.EXPORT]: "Export",
  [PRODUCT_OPERATION_TYPE.ROLLBACK]: "Rollback",
});

const activeLocalOperationsByDatasetName = new Map();
const activeExternalOperationsByDatasetName = new Map();

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

  const localOperations = getLocalOperationsForDataset(normalizedDatasetName);
  const allOperations = getAllOperationsForDataset(normalizedDatasetName);
  const existingOperation = findBlockingOperation(allOperations, {
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
  const key = createOperationKey({
    normalizedDatasetName,
    type: normalizedType,
    operationId: normalizedOperationId,
    source: PRODUCT_OPERATION_SOURCE.LOCAL,
  });

  if (localOperations.has(key)) {
    const duplicateOperation = localOperations.get(key);

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
    source: PRODUCT_OPERATION_SOURCE.LOCAL,
    startedAt: Date.now(),
    startedAtText: null,
    startedBy: null,
  };

  localOperations.set(operation.key, operation);
  activeLocalOperationsByDatasetName.set(normalizedDatasetName, localOperations);
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

  for (const [normalizedDatasetName, operations] of activeLocalOperationsByDatasetName.entries()) {
    const operation = operations.get(key);

    if (!operation) {
      continue;
    }

    operations.delete(key);

    if (operations.size === 0) {
      activeLocalOperationsByDatasetName.delete(normalizedDatasetName);
    }

    emitProductOperationStateChanged(operation.datasetName);
    return;
  }
}

export function replaceExternalProductOperations(datasetName, operations = []) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    return;
  }

  const nextOperations = new Map();

  for (const operationInput of operations) {
    const operation = normalizeExternalOperation(operationInput, {
      datasetName,
      normalizedDatasetName,
    });

    if (operation) {
      nextOperations.set(operation.key, operation);
    }
  }

  if (nextOperations.size > 0) {
    activeExternalOperationsByDatasetName.set(normalizedDatasetName, nextOperations);
  } else {
    activeExternalOperationsByDatasetName.delete(normalizedDatasetName);
  }

  emitProductOperationStateChanged(datasetName);
}

export function clearExternalProductOperations(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    return;
  }

  if (!activeExternalOperationsByDatasetName.has(normalizedDatasetName)) {
    return;
  }

  activeExternalOperationsByDatasetName.delete(normalizedDatasetName);
  emitProductOperationStateChanged(datasetName);
}

export function getProductOperationState(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);
  const operations = normalizedDatasetName
    ? getSortedOperations(getAllOperationsForDataset(normalizedDatasetName))
    : [];
  const primaryOperation = operations[0] ?? null;

  return {
    running: operations.length > 0,
    operation: primaryOperation,
    operations,
    localOperations: operations.filter(isLocalOperation),
    externalOperations: operations.filter(isExternalOperation),
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

function getLocalOperationsForDataset(normalizedDatasetName) {
  return activeLocalOperationsByDatasetName.get(normalizedDatasetName) ?? new Map();
}

function getExternalOperationsForDataset(normalizedDatasetName) {
  return activeExternalOperationsByDatasetName.get(normalizedDatasetName) ?? new Map();
}

function getAllOperationsForDataset(normalizedDatasetName) {
  return [
    ...getExternalOperationsForDataset(normalizedDatasetName).values(),
    ...getLocalOperationsForDataset(normalizedDatasetName).values(),
  ];
}

function findBlockingOperation(operations, { type, allowConcurrentSameType } = {}) {
  for (const operation of operations) {
    if (allowConcurrentSameType && operation.type === type) {
      continue;
    }

    return operation;
  }

  return null;
}

function getSortedOperations(operations) {
  return [...operations].sort((left, right) => {
    return getOperationStartValue(left) - getOperationStartValue(right);
  });
}

function createDisabledReason(primaryOperation, operations) {
  if (operations.length > 1) {
    return `Multiple product operations are already running for ${primaryOperation.datasetName}.`;
  }

  return `${formatProductOperation(primaryOperation)} is already running for ${primaryOperation.datasetName}.`;
}

function normalizeExternalOperation(operationInput, { datasetName, normalizedDatasetName }) {
  const type = normalizeOperationType(operationInput?.type);

  if (!type) {
    return null;
  }

  const operationId =
    normalizeOperationId(operationInput?.id) ??
    normalizeOperationId(operationInput?.operationId) ??
    createDefaultOperationId(type);
  const source = normalizeOperationSource(operationInput?.source);
  const startedAtText = normalizeText(operationInput?.startedAt);
  const startedAt = getStartedAtValue(startedAtText);

  return {
    key: createOperationKey({
      normalizedDatasetName,
      type,
      operationId,
      source,
    }),
    operationId,
    datasetName: operationInput?.datasetName ?? datasetName,
    normalizedDatasetName,
    type,
    label: normalizeText(operationInput?.label) ?? getProductOperationTypeLabel(type),
    source,
    startedAt,
    startedAtText,
    startedBy: normalizeText(operationInput?.startedBy),
  };
}

function createOperationKey({ normalizedDatasetName, type, operationId, source }) {
  return `${normalizedDatasetName}:${source}:${type}:${operationId}`;
}

function isLocalOperation(operation) {
  return operation.source === PRODUCT_OPERATION_SOURCE.LOCAL;
}

function isExternalOperation(operation) {
  return operation.source !== PRODUCT_OPERATION_SOURCE.LOCAL;
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

function getOperationStartValue(operation) {
  if (Number.isFinite(operation?.startedAt)) {
    return operation.startedAt;
  }

  return 0;
}

function getStartedAtValue(value) {
  const timestamp = new Date(value).getTime();

  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  return Date.now();
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

function normalizeOperationSource(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  if (Object.values(PRODUCT_OPERATION_SOURCE).includes(normalizedValue)) {
    return normalizedValue;
  }

  return PRODUCT_OPERATION_SOURCE.BACKEND;
}

function normalizeOperationId(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  return normalizedValue || null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();

  return text || null;
}
