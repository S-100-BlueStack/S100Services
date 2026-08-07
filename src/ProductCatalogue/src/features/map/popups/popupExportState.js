const POPUP_EXPORT_STATE_CHANGED_EVENT = "pc:popup-export-state-changed";
const ALL_EXPORT_SCOPE = "all";

const activeExportActions = new Map();

export function beginPopupExportAction({
  productContext,
  productIdentity,
  sourceId,
  productKey,
  datasetName,
  scope,
  exportType,
} = {}) {
  const exportAction = createExportAction({
    productContext,
    productIdentity,
    sourceId,
    productKey,
    datasetName,
    scope,
    exportType,
  });

  if (!exportAction) {
    return {
      started: false,
      conflict: null,
      reason: "Export action is missing required data.",
    };
  }

  const conflict = getPopupExportConflict(exportAction);
  if (conflict) {
    return {
      started: false,
      conflict,
      reason: getExportConflictReason(exportAction, conflict),
    };
  }

  activeExportActions.set(exportAction.key, {
    ...exportAction,
    startedAt: Date.now(),
  });
  emitPopupExportStateChanged(exportAction);

  return {
    started: true,
    key: exportAction.key,
    conflict: null,
    reason: null,
  };
}

export function endPopupExportAction(key) {
  const exportAction = activeExportActions.get(key);
  if (!exportAction) {
    return;
  }

  activeExportActions.delete(key);
  emitPopupExportStateChanged(exportAction);
}

export function getPopupExportActionState({
  productContext,
  productIdentity,
  sourceId,
  productKey,
  datasetName,
  scope,
  exportType,
} = {}) {
  const exportAction = createExportAction({
    productContext,
    productIdentity,
    sourceId,
    productKey,
    datasetName,
    scope,
    exportType,
  });

  if (!exportAction) {
    return createIdleExportState();
  }

  const runningAction = activeExportActions.get(exportAction.key);
  if (runningAction) {
    return {
      running: true,
      blocked: true,
      loading: true,
      disabledReason: `${formatExportAction(runningAction)} is already running for ${formatProduct(
        runningAction
      )}.`,
    };
  }

  const conflict = getPopupExportConflict(exportAction);
  if (conflict) {
    return {
      running: false,
      blocked: true,
      loading: false,
      disabledReason: getExportConflictReason(exportAction, conflict),
    };
  }

  return createIdleExportState();
}

export function isAnyPopupExportActionRunning(productOrDatasetName) {
  const identity = resolveProductIdentity(
    typeof productOrDatasetName === "string"
      ? { datasetName: productOrDatasetName }
      : { productContext: productOrDatasetName }
  );

  if (!identity) {
    return false;
  }

  return [...activeExportActions.values()].some(
    (action) => action.productIdentityKey === identity.productIdentityKey
  );
}

export function clearPopupExportUiState({
  productContext,
  productIdentity,
  sourceId,
  productKey,
  datasetName,
} = {}) {
  const identity = resolveProductIdentity({
    productContext,
    productIdentity,
    sourceId,
    productKey,
    datasetName,
  });
  const normalizedSourceId = normalizeSourceId(sourceId ?? productContext?.sourceId);
  let removed = 0;

  for (const [key, action] of activeExportActions) {
    const matchesIdentity = identity && action.productIdentityKey === identity.productIdentityKey;
    const matchesSource =
      !identity && normalizedSourceId && action.normalizedSourceId === normalizedSourceId;

    if (!matchesIdentity && !matchesSource) {
      continue;
    }

    activeExportActions.delete(key);
    removed += 1;
    emitPopupExportStateChanged(action);
  }

  return removed;
}

export function onPopupExportStateChanged(callback) {
  const handler = (event) => {
    callback?.(event.detail);
  };

  document.addEventListener(POPUP_EXPORT_STATE_CHANGED_EVENT, handler);

  return () => {
    document.removeEventListener(POPUP_EXPORT_STATE_CHANGED_EVENT, handler);
  };
}

function getPopupExportConflict(exportAction) {
  for (const runningAction of activeExportActions.values()) {
    if (runningAction.productIdentityKey !== exportAction.productIdentityKey) {
      continue;
    }

    if (exportActionsOverlap(exportAction, runningAction)) {
      return runningAction;
    }
  }

  return null;
}

function exportActionsOverlap(candidate, runningAction) {
  return (
    candidate.normalizedScope === ALL_EXPORT_SCOPE ||
    runningAction.normalizedScope === ALL_EXPORT_SCOPE ||
    candidate.normalizedScope === runningAction.normalizedScope
  );
}

function createExportAction({ scope, exportType, ...productInput }) {
  const identity = resolveProductIdentity(productInput);
  if (!identity || !scope || !exportType) {
    return null;
  }

  const normalizedScope = normalizeScope(scope);
  const normalizedExportType = normalizeExportType(exportType);

  return {
    key: `${identity.productIdentityKey}:${normalizedScope}:${normalizedExportType}`,
    ...identity,
    scope,
    normalizedScope,
    exportType,
    normalizedExportType,
  };
}

function resolveProductIdentity({
  productContext,
  productIdentity,
  sourceId,
  productKey,
  datasetName,
} = {}) {
  const resolvedDatasetName = normalizeText(datasetName ?? productContext?.datasetName);
  const resolvedSourceId = normalizeText(
    sourceId ?? productContext?.sourceId ?? productIdentity?.sourceId
  );
  const resolvedProductKey = normalizeText(
    productKey ?? productContext?.productKey ?? productIdentity?.productKey
  );

  // Dataset names are currently globally unique and preserve compatibility with
  // the existing operation pipeline. Source-aware identity is used when no dataset exists.
  const productIdentityKey = resolvedDatasetName
    ? `dataset:${normalizeDatasetName(resolvedDatasetName)}`
    : resolvedSourceId && resolvedProductKey
      ? `source:${normalizeSourceId(resolvedSourceId)}:${normalizeProductKey(resolvedProductKey)}`
      : null;

  if (!productIdentityKey) {
    return null;
  }

  return {
    productIdentityKey,
    sourceId: resolvedSourceId,
    normalizedSourceId: normalizeSourceId(resolvedSourceId),
    productKey: resolvedProductKey,
    datasetName: resolvedDatasetName,
    normalizedDatasetName: normalizeDatasetName(resolvedDatasetName),
  };
}

function getExportConflictReason(exportAction, conflict) {
  if (conflict.normalizedScope === ALL_EXPORT_SCOPE) {
    return `${formatExportAction(conflict)} is already running for ${formatProduct(conflict)}.`;
  }

  if (exportAction.normalizedScope === ALL_EXPORT_SCOPE) {
    return `${formatExportAction(conflict)} is already running for ${formatProduct(
      conflict
    )}. Wait until it finishes before exporting All.`;
  }

  return `${formatExportAction(conflict)} is already running for ${formatProduct(conflict)}.`;
}

function formatExportAction(exportAction) {
  return `${exportAction.scope} ${exportAction.exportType}`;
}

function formatProduct(exportAction) {
  return exportAction.datasetName ?? exportAction.productKey ?? "the selected Product";
}

function emitPopupExportStateChanged(exportAction) {
  document.dispatchEvent(
    new CustomEvent(POPUP_EXPORT_STATE_CHANGED_EVENT, {
      detail: {
        productIdentityKey: exportAction.productIdentityKey,
        sourceId: exportAction.sourceId,
        datasetName: exportAction.datasetName,
      },
    })
  );
}

function createIdleExportState() {
  return {
    running: false,
    blocked: false,
    loading: false,
    disabledReason: null,
  };
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDatasetName(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeSourceId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeProductKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeScope(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeExportType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
