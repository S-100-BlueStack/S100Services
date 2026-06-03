import { isStatusFrozen } from "../../map/state/featureState.js";

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

    freeze: createFreezeAvailability({
      hasDatasetName,
    }),

    unfreeze: createUnfreezeAvailability({
      hasDatasetName,
    }),

    sendImmediately: createSendAvailability({
      hasDatasetName,
      frozen: productIsFrozen,
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

function createFreezeAvailability({ hasDatasetName }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  return available();
}

function createUnfreezeAvailability({ hasDatasetName }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  return available();
}

function createSendAvailability({ hasDatasetName, frozen }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (frozen) {
    return unavailable("Unfreeze the product before sending.");
  }

  return available();
}

function createExportRootAvailability({ hasDatasetName, exportHasRunningAction }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

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
