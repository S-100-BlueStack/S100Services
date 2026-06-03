import { isStatusFrozen } from "../../map/state/featureState.js";

const EXPORT_RUNNING_REASON = "Wait until the current export finishes.";

export function createProductActionAvailability({
  attributes,
  frozen,
  exportHasRunningAction = false,
} = {}) {
  const datasetName = getDatasetName(attributes);
  const hasDatasetName = Boolean(datasetName);
  const productIsFrozen = frozen ?? isStatusFrozen(attributes?.status);

  return {
    datasetName,
    hasDatasetName,
    frozen: productIsFrozen,
    exportHasRunningAction,

    freeze: createFreezeAvailability({
      hasDatasetName,
      exportHasRunningAction,
    }),

    unfreeze: createUnfreezeAvailability({
      hasDatasetName,
      exportHasRunningAction,
    }),

    sendImmediately: createSendAvailability({
      hasDatasetName,
      frozen: productIsFrozen,
      exportHasRunningAction,
    }),

    rollback: createRollbackAvailability({
      hasDatasetName,
      exportHasRunningAction,
    }),

    exportRoot: createExportRootAvailability({
      hasDatasetName,
      exportHasRunningAction,
    }),
  };
}

export function createProductExportAvailability({
  attributes,
  frozen,
  implemented,
  exportState,
} = {}) {
  const datasetName = getDatasetName(attributes);
  const hasDatasetName = Boolean(datasetName);
  const productIsFrozen = frozen ?? isStatusFrozen(attributes?.status);

  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportState?.running) {
    return unavailable(exportState.disabledReason, {
      loading: true,
      label: "Exporting...",
    });
  }

  if (exportState?.blocked) {
    return unavailable(exportState.disabledReason);
  }

  if (productIsFrozen) {
    return unavailable("Unfreeze the product before exporting.");
  }

  if (!implemented) {
    return unavailable("Feature is not available yet.");
  }

  return available();
}

function createFreezeAvailability({ hasDatasetName, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportHasRunningAction) {
    return unavailable(EXPORT_RUNNING_REASON);
  }

  return available();
}

function createUnfreezeAvailability({ hasDatasetName, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportHasRunningAction) {
    return unavailable(EXPORT_RUNNING_REASON);
  }

  return available();
}

function createSendAvailability({ hasDatasetName, frozen, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportHasRunningAction) {
    return unavailable(EXPORT_RUNNING_REASON);
  }

  if (frozen) {
    return unavailable("Unfreeze the product before sending.");
  }

  return available();
}

function createRollbackAvailability({ hasDatasetName, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportHasRunningAction) {
    return unavailable(EXPORT_RUNNING_REASON);
  }

  return available();
}

function createExportRootAvailability({ hasDatasetName, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  // Keep the root export action openable while an export runs. The leaf actions
  // explain which export is running and which actions are blocked.
  return available({
    label: exportHasRunningAction ? "Exporting..." : "Export...",
  });
}

function available(extra = {}) {
  return {
    disabled: false,
    disabledReason: null,
    loading: false,
    label: null,
    ...extra,
  };
}

function unavailable(disabledReason, extra = {}) {
  return {
    disabled: true,
    disabledReason,
    loading: false,
    label: null,
    ...extra,
  };
}

function getDatasetName(attributes) {
  return (
    attributes?.datasetName ??
    attributes?.DatasetName ??
    attributes?.name ??
    attributes?.Name ??
    null
  );
}
