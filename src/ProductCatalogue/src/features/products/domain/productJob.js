export const PRODUCT_JOB_STATUS = Object.freeze({
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
});

export const PRODUCT_JOB_OPERATION = Object.freeze({
  EXPORT_EDITION: "ExportEdition",
  EXPORT_UPDATE: "ExportUpdate",
  ROLLBACK: "CancelExport",
  SEND_TO_ICENC: "SendToIcEnc",
});

const BACKEND_NEW_DATASET_OPERATION = "NewDataset";
const NEW_DATASET_COMPATIBLE_OPERATIONS = new Set([
  PRODUCT_JOB_OPERATION.EXPORT_EDITION.toLowerCase(),
  PRODUCT_JOB_OPERATION.EXPORT_UPDATE.toLowerCase(),
]);
const SEND_SIMULATION_MODE = "Simulation";
const SEND_SIMULATION_OUTCOME = "SimulationCompleted";
const SEND_NOT_DELIVERED_STATUS = "NotDelivered";
const TERMINAL_STATUSES = new Set([
  PRODUCT_JOB_STATUS.SUCCEEDED.toLowerCase(),
  PRODUCT_JOB_STATUS.FAILED.toLowerCase(),
  PRODUCT_JOB_STATUS.CANCELLED.toLowerCase(),
]);

export function createProductJobRecord({
  response,
  datasetName,
  operationType,
  exportTarget = null,
  label,
}) {
  const jobId = normalizeText(response?.jobId);
  const normalizedDatasetName = normalizeText(response?.datasetName) || normalizeText(datasetName);
  const responseOperationType = normalizeText(response?.operationType);
  const expectedOperationType = normalizeText(operationType);
  const normalizedOperationType = resolveProductJobOperation(
    responseOperationType,
    expectedOperationType
  );

  if (
    response?.datasetName &&
    datasetName &&
    normalizeText(response.datasetName).toLowerCase() !== normalizeText(datasetName).toLowerCase()
  )
    return null;
  if (!jobId || !normalizedDatasetName || !normalizedOperationType) {
    return null;
  }

  const mode = normalizeNullableText(response?.mode);
  const deliveryStatus = normalizeNullableText(response?.deliveryStatus);
  if (
    isSendToIcEncOperation(normalizedOperationType) &&
    (mode !== SEND_SIMULATION_MODE || deliveryStatus !== SEND_NOT_DELIVERED_STATUS)
  ) {
    return null;
  }

  return {
    jobId,
    datasetName: normalizedDatasetName,
    operationType: normalizedOperationType,
    exportTarget: normalizeNullableText(response?.exportTarget ?? exportTarget),
    label:
      isRollbackOperation(normalizedOperationType) ||
      isExportEditionOperation(normalizedOperationType)
        ? createProductJobLabel(normalizedOperationType, response?.exportTarget ?? exportTarget)
        : normalizeText(label) ||
          createProductJobLabel(normalizedOperationType, response?.exportTarget ?? exportTarget),
    createdAt: normalizeText(response?.createdAt) || new Date().toISOString(),
    correlationId: normalizeNullableText(response?.correlationId),
    statusUrl: normalizeNullableText(response?.statusUrl),
    status: normalizeNullableText(response?.status),
    mode,
    deliveryStatus,
  };
}

export function normalizeStoredProductJob(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return createProductJobRecord({
    response: value,
    datasetName: value.datasetName,
    operationType: value.operationType,
    exportTarget: value.exportTarget,
    label: value.label,
  });
}

export function isTerminalProductJobStatus(status) {
  return TERMINAL_STATUSES.has(normalizeText(status).toLowerCase());
}

export function createProductJobActionResult(statusResponse, { expectedOperationType } = {}) {
  const status = normalizeText(statusResponse?.status);
  const actualOperationType = normalizeText(statusResponse?.operationType);
  const normalizedExpectedOperationType = normalizeText(expectedOperationType);

  if (
    normalizedExpectedOperationType &&
    !productJobOperationsMatch(actualOperationType, normalizedExpectedOperationType)
  ) {
    const error = {
      code: "JOB_STATUS_INVALID",
      message: "The operation job returned an unexpected operation type.",
    };
    return {
      success: false,
      data: {
        ...statusResponse,
        code: error.code,
        message: error.message,
        error,
      },
      jobStatus: statusResponse,
    };
  }

  if (status.toLowerCase() === PRODUCT_JOB_STATUS.SUCCEEDED.toLowerCase()) {
    if (isSendToIcEncOperation(statusResponse?.operationType)) {
      const contractError = validateSendSimulationResult(statusResponse);
      if (contractError) {
        return {
          success: false,
          data: {
            ...statusResponse,
            code: contractError.code,
            message: contractError.message,
            error: contractError,
          },
          jobStatus: statusResponse,
        };
      }
    }

    return {
      success: true,
      status: 200,
      data: statusResponse,
      jobStatus: statusResponse,
      warning: statusResponse?.warning ?? null,
    };
  }

  const error = normalizeJobError(statusResponse);
  return {
    success: false,
    data: {
      ...statusResponse,
      code: error.code,
      message: error.message,
      error,
    },
    jobStatus: statusResponse,
  };
}

export function createProductJobLabel(operationType, specification) {
  if (isSendToIcEncOperation(operationType)) {
    return "Simulating IC-ENC send";
  }

  if (isRollbackOperation(operationType)) return "Canceling export";
  const label = specificationLabel(specification);
  if (isExportEditionOperation(operationType)) {
    return `Exporting ${label ? `${label} ` : ""}Edition`;
  }
  if (
    normalizeText(operationType).toLowerCase() ===
    PRODUCT_JOB_OPERATION.EXPORT_UPDATE.toLowerCase()
  ) {
    return `Exporting ${label ? `${label} ` : ""}Update`;
  }

  return label ? `Exporting ${label} export` : "Exporting";
}

export function createProductJobCompletionTitle(record, statusResponse) {
  const action = isSendToIcEncOperation(record?.operationType)
    ? "IC-ENC send simulation"
    : isRollbackOperation(record?.operationType)
      ? "Cancel Export"
      : isExportEditionOperation(record?.operationType)
        ? `${specificationLabel(record?.exportTarget) ? `${specificationLabel(record.exportTarget)} ` : ""}Edition export`
        : record?.operationType === PRODUCT_JOB_OPERATION.EXPORT_UPDATE
          ? `${specificationLabel(record.exportTarget)} Update export`.trim()
          : "Export";
  const status = normalizeText(statusResponse?.status);

  if (status.toLowerCase() === PRODUCT_JOB_STATUS.SUCCEEDED.toLowerCase()) {
    return `${action} completed for ${record.datasetName}`;
  }

  return `${action} failed for ${record.datasetName}`;
}

export function getProductJobFailureMessage(statusResponse) {
  return normalizeJobError(statusResponse).message;
}

function resolveProductJobOperation(responseOperationType, expectedOperationType) {
  const actual = normalizeText(responseOperationType);
  const expected = normalizeText(expectedOperationType);

  if (!actual) {
    return expected;
  }
  if (!expected) {
    return actual;
  }

  return productJobOperationsMatch(actual, expected) ? expected : "";
}

function productJobOperationsMatch(actualOperationType, expectedOperationType) {
  const actual = normalizeText(actualOperationType).toLowerCase();
  const expected = normalizeText(expectedOperationType).toLowerCase();

  if (!actual || !expected) {
    return false;
  }
  if (actual === expected) {
    return true;
  }

  return (
    actual === BACKEND_NEW_DATASET_OPERATION.toLowerCase() &&
    NEW_DATASET_COMPATIBLE_OPERATIONS.has(expected)
  );
}

function isExportEditionOperation(operationType) {
  return (
    normalizeText(operationType).toLowerCase() ===
    PRODUCT_JOB_OPERATION.EXPORT_EDITION.toLowerCase()
  );
}

export function isRollbackOperation(operationType) {
  return [PRODUCT_JOB_OPERATION.ROLLBACK.toLowerCase(), "rollback"].includes(
    normalizeText(operationType).toLowerCase()
  );
}

export function isSendToIcEncOperation(operationType) {
  return (
    normalizeText(operationType).toLowerCase() === PRODUCT_JOB_OPERATION.SEND_TO_ICENC.toLowerCase()
  );
}

function validateSendSimulationResult(statusResponse) {
  const mode = normalizeText(statusResponse?.mode);
  const operationOutcome = normalizeText(statusResponse?.operationOutcome);
  const deliveryStatus = normalizeText(statusResponse?.deliveryStatus);
  const message = normalizeText(statusResponse?.message);

  if (
    mode === SEND_SIMULATION_MODE &&
    operationOutcome === SEND_SIMULATION_OUTCOME &&
    deliveryStatus === SEND_NOT_DELIVERED_STATUS &&
    message.toLowerCase().includes("no data was sent") &&
    !containsDeliverySuccessWording(message)
  ) {
    return null;
  }

  return {
    code: "SEND_SIMULATION_RESULT_INVALID",
    message: "The IC-ENC send simulation returned an invalid terminal result.",
  };
}

function containsDeliverySuccessWording(message) {
  return [
    /\bsent successfully\b|\bsuccessfully sent\b/i,
    /\bdelivered successfully\b|\bsuccessfully delivered\b/i,
  ].some((pattern) => pattern.test(message));
}

function normalizeJobError(statusResponse) {
  const status = normalizeText(statusResponse?.status);
  const nestedError = statusResponse?.error;
  const code =
    normalizeText(nestedError?.code) ||
    normalizeText(statusResponse?.code) ||
    (status.toLowerCase() === PRODUCT_JOB_STATUS.CANCELLED.toLowerCase()
      ? "JOB_CANCELLED"
      : "JOB_FAILED");
  const message =
    normalizeText(nestedError?.message) ||
    normalizeText(statusResponse?.message) ||
    (status.toLowerCase() === PRODUCT_JOB_STATUS.CANCELLED.toLowerCase()
      ? "The operation was cancelled."
      : "The operation failed.");
  return { code, message };
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function specificationLabel(value) {
  return { S100: "S-101", S101: "S-101", S57: "S-57" }[value] ?? "";
}
