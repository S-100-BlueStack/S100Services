export const PRODUCT_JOB_STATUS = Object.freeze({
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
});

export const PRODUCT_JOB_OPERATION = Object.freeze({
  EXPORT_EDITION: "ExportEdition",
  ROLLBACK: "Rollback",
});

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
  const normalizedOperationType =
    normalizeText(response?.operationType) || normalizeText(operationType);

  if (!jobId || !normalizedDatasetName || !normalizedOperationType) {
    return null;
  }

  return {
    jobId,
    datasetName: normalizedDatasetName,
    operationType: normalizedOperationType,
    exportTarget: normalizeNullableText(response?.exportTarget ?? exportTarget),
    label: normalizeText(label) || createProductJobLabel(normalizedOperationType),
    createdAt: normalizeText(response?.createdAt) || new Date().toISOString(),
    correlationId: normalizeNullableText(response?.correlationId),
    statusUrl: normalizeNullableText(response?.statusUrl),
    status: normalizeNullableText(response?.status),
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

export function createProductJobActionResult(statusResponse) {
  const status = normalizeText(statusResponse?.status);

  if (status.toLowerCase() === PRODUCT_JOB_STATUS.SUCCEEDED.toLowerCase()) {
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

export function createProductJobLabel(operationType) {
  return isRollbackOperation(operationType) ? "Rolling back" : "Exporting S100 Edition";
}

export function createProductJobCompletionTitle(record, statusResponse) {
  const action = isRollbackOperation(record?.operationType) ? "Rollback" : "Export";
  const status = normalizeText(statusResponse?.status);

  if (status.toLowerCase() === PRODUCT_JOB_STATUS.SUCCEEDED.toLowerCase()) {
    return `${action} completed for ${record.datasetName}`;
  }

  return `${action} failed for ${record.datasetName}`;
}

export function getProductJobFailureMessage(statusResponse) {
  return normalizeJobError(statusResponse).message;
}

export function isRollbackOperation(operationType) {
  return (
    normalizeText(operationType).toLowerCase() === PRODUCT_JOB_OPERATION.ROLLBACK.toLowerCase()
  );
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
