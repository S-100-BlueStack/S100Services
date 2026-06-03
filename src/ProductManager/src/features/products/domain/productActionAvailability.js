import { isStatusFrozen } from "../../map/state/featureState";

export function createProductActionAvailability({
  attributes,
  frozen,
  exportIsRunning = false,
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

    export: createExportRootAvailability({
      hasDatasetName,
      datasetName,
      exportIsRunning,
    }),

    exports: {
      allEdition: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: true,
        exportIsRunning,
      }),
      allUpdate: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: true,
        exportIsRunning,
      }),
      s57Edition: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: false,
        exportIsRunning,
      }),
      s57Update: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: false,
        exportIsRunning,
      }),
      s100Edition: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: false,
        exportIsRunning,
      }),
      s100Update: createExportLeafAvailability({
        hasDatasetName,
        frozen: productIsFrozen,
        implemented: false,
        exportIsRunning,
      }),
    },
  };
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

function createExportRootAvailability({ hasDatasetName, datasetName, exportIsRunning }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportIsRunning) {
    return unavailable(`An export is already running for ${datasetName}.`, {
      loading: true,
    });
  }

  return available();
}

function createExportLeafAvailability({ hasDatasetName, frozen, implemented, exportIsRunning }) {
  if (!hasDatasetName) {
    return unavailable("The selected feature does not have a datasetName.");
  }

  if (exportIsRunning) {
    return unavailable("An export is already running for this product.");
  }

  if (frozen) {
    return unavailable("Unfreeze the product before exporting.");
  }

  if (!implemented) {
    return unavailable("Feature is not available yet.");
  }

  return available();
}

function available(extra = {}) {
  return {
    disabled: false,
    disabledReason: null,
    loading: false,
    ...extra,
  };
}

function unavailable(disabledReason, extra = {}) {
  return {
    disabled: true,
    disabledReason,
    loading: false,
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
