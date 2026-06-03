const POPUP_EXPORT_STATE_CHANGED_EVENT = "pm:popup-export-state-changed";
const ALL_EXPORT_SCOPE = "all";

const activeExportActions = new Map();

export function beginPopupExportAction({ datasetName, scope, exportType }) {
  const exportAction = createExportAction({
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

  emitPopupExportStateChanged(exportAction.datasetName);

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
  emitPopupExportStateChanged(exportAction.datasetName);
}

export function getPopupExportActionState({ datasetName, scope, exportType }) {
  const exportAction = createExportAction({
    datasetName,
    scope,
    exportType,
  });

  if (!exportAction) {
    return {
      running: false,
      blocked: false,
      loading: false,
      disabledReason: null,
    };
  }

  const runningAction = activeExportActions.get(exportAction.key);

  if (runningAction) {
    return {
      running: true,
      blocked: true,
      loading: true,
      disabledReason: `${formatExportAction(runningAction)} is already running for ${runningAction.datasetName}.`,
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

  return {
    running: false,
    blocked: false,
    loading: false,
    disabledReason: null,
  };
}

export function isAnyPopupExportActionRunning(datasetName) {
  if (!datasetName) {
    return false;
  }

  const normalizedDatasetName = normalizeDatasetName(datasetName);

  return [...activeExportActions.values()].some(
    (action) => action.normalizedDatasetName === normalizedDatasetName
  );
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
    if (runningAction.normalizedDatasetName !== exportAction.normalizedDatasetName) {
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

function createExportAction({ datasetName, scope, exportType }) {
  if (!datasetName || !scope || !exportType) {
    return null;
  }

  const normalizedDatasetName = normalizeDatasetName(datasetName);
  const normalizedScope = normalizeScope(scope);
  const normalizedExportType = normalizeExportType(exportType);

  return {
    key: `${normalizedDatasetName}:${normalizedScope}:${normalizedExportType}`,
    datasetName,
    normalizedDatasetName,
    scope,
    normalizedScope,
    exportType,
    normalizedExportType,
  };
}

function getExportConflictReason(exportAction, conflict) {
  if (conflict.normalizedScope === ALL_EXPORT_SCOPE) {
    return `${formatExportAction(conflict)} is already running for ${conflict.datasetName}.`;
  }

  if (exportAction.normalizedScope === ALL_EXPORT_SCOPE) {
    return `${formatExportAction(conflict)} is already running for ${conflict.datasetName}. Wait until it finishes before exporting All.`;
  }

  return `${formatExportAction(conflict)} is already running for ${conflict.datasetName}.`;
}

function formatExportAction(exportAction) {
  return `${exportAction.scope} ${exportAction.exportType}`;
}

function emitPopupExportStateChanged(datasetName) {
  document.dispatchEvent(
    new CustomEvent(POPUP_EXPORT_STATE_CHANGED_EVENT, {
      detail: {
        datasetName,
      },
    })
  );
}

function normalizeDatasetName(value) {
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
