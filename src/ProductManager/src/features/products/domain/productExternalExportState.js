import { PRODUCT_OPERATION_TYPE } from "../state/productOperationState.js";

const ALL_EXPORT_SCOPE = "all";

export function hasRunningProductExportOperation(productOperationState) {
  return getExportOperations(productOperationState).length > 0;
}

export function getExternalProductExportState({
  productOperationState,
  target,
  exportType,
} = {}) {
  const candidateTarget = normalizeText(target);
  const candidateExportType = normalizeText(exportType);

  if (!candidateTarget || !candidateExportType) {
    return createAvailableState();
  }

  const exportOperations = getExportOperations(productOperationState);
  const runningOperation = exportOperations.find((operation) => {
    return (
      normalizeText(operation.exportTarget) === candidateTarget &&
      normalizeText(operation.exportType) === candidateExportType
    );
  });

  if (runningOperation) {
    return {
      running: true,
      blocked: true,
      loading: true,
      disabledReason: createOperationReason(runningOperation),
    };
  }

  const conflict = exportOperations.find((operation) => {
    return exportScopesOverlap(
      candidateTarget,
      normalizeText(operation.exportTarget),
    );
  });

  if (conflict) {
    return {
      running: false,
      blocked: true,
      loading: false,
      disabledReason: createOperationReason(conflict),
    };
  }

  return createAvailableState();
}

export function mergeProductExportStates(localState, externalState) {
  if (localState?.running || localState?.blocked) {
    return localState;
  }

  return externalState ?? createAvailableState();
}

function getExportOperations(productOperationState) {
  const operations = Array.isArray(productOperationState?.operations)
    ? productOperationState.operations
    : productOperationState?.operation
      ? [productOperationState.operation]
      : [];

  return operations.filter(
    (operation) => operation?.type === PRODUCT_OPERATION_TYPE.EXPORT,
  );
}

function exportScopesOverlap(candidateTarget, runningTarget) {
  if (!runningTarget) {
    return true;
  }

  return (
    candidateTarget === ALL_EXPORT_SCOPE ||
    runningTarget === ALL_EXPORT_SCOPE ||
    candidateTarget === runningTarget
  );
}

function createOperationReason(operation) {
  const label = String(operation?.label ?? "Export").trim() || "Export";
  const datasetName = String(operation?.datasetName ?? "the product").trim();
  return `${label} is already running for ${datasetName}.`;
}

function createAvailableState() {
  return {
    running: false,
    blocked: false,
    loading: false,
    disabledReason: null,
  };
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}
