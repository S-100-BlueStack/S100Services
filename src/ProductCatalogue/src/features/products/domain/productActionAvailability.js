import {
  PRODUCT_OPERATION_CAPABILITY,
  getProductContextCapabilityReason,
  productContextSupportsCapability,
} from "./productContext.js";

const MISSING_DATASET_NAME_REASON = "The selected feature does not have a datasetName.";
const EXPORT_RUNNING_REASON = "Wait until the current export finishes.";
const PRODUCT_OPERATION_RUNNING_REASON = "Wait until the current product operation finishes.";
const SEND_CAPABILITY_UNAVAILABLE_REASON = "Send to IC-ENC availability could not be verified.";
const EXPORT_STATE_REASON = "New Edition is only available when product status is Idle.";
const ROLLBACK_STATE_REASON =
  "Rollback is only available when product status is Exported or Frozen.";

const PRODUCT_STATE_ID = Object.freeze({
  IDLE: 1,
  EXPORTED: 2,
  FROZEN: 5,
});

export function createProductActionAvailability({
  attributes,
  productContext,
  frozen = false,
  exportHasRunningAction = false,
  productHasRunningMutation = false,
  productOperationDisabledReason = PRODUCT_OPERATION_RUNNING_REASON,
  sendToIcEncCapability,
} = {}) {
  const datasetName = getDatasetName(attributes);
  const hasDatasetName = Boolean(datasetName);
  const productIsFrozen = Boolean(frozen);
  const productState = getProductState(attributes);
  const mutationContext = {
    hasDatasetName,
    exportHasRunningAction,
    productHasRunningMutation,
    productOperationDisabledReason,
  };

  return {
    datasetName,
    hasDatasetName,
    frozen: productIsFrozen,
    exportHasRunningAction,
    productHasRunningMutation,
    freeze: capabilityAvailability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.FREEZE,
      createMutationAvailability(mutationContext)
    ),
    unfreeze: capabilityAvailability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.UNFREEZE,
      createMutationAvailability(mutationContext)
    ),
    sendImmediately: capabilityAvailability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.SEND_TO_IC_ENC,
      createSendAvailability({
        ...mutationContext,
        frozen: productIsFrozen,
        productState,
        capability: sendToIcEncCapability,
      })
    ),
    rollback: capabilityAvailability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.CANCEL_EXPORT,
      createRollbackAvailability({
        ...mutationContext,
        productState,
      })
    ),
    exportRoot: capabilityAvailability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.POPUP_EXPORT,
      createExportRootAvailability(mutationContext)
    ),
  };
}

export function createProductExportAvailability({
  attributes,
  productContext,
  capabilityName,
  availabilityReason,
  frozen = false,
  implemented,
  exportState,
  productHasRunningMutation = false,
  productOperationDisabledReason = PRODUCT_OPERATION_RUNNING_REASON,
} = {}) {
  const datasetName = getDatasetName(attributes);
  const hasDatasetName = Boolean(datasetName);
  const productIsFrozen = Boolean(frozen);
  const productState = getProductState(attributes);
  const capabilitySupported = supportsCapability(productContext, capabilityName);

  if (!hasDatasetName) {
    return unavailable(MISSING_DATASET_NAME_REASON);
  }
  if (!capabilitySupported || implemented !== true) {
    return unavailable(
      normalizeText(availabilityReason) ||
        (productContext === undefined
          ? null
          : getProductContextCapabilityReason(productContext, capabilityName)) ||
        "Feature is not available yet."
    );
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
  if (productHasRunningMutation) {
    return unavailable(productOperationDisabledReason);
  }
  if (productIsFrozen) {
    return unavailable("Unfreeze the product before exporting.");
  }
  if (productState.known && !isIdleState(productState)) {
    return unavailable(EXPORT_STATE_REASON);
  }

  return available();
}

export function createSendToIcEncCapabilityAvailability(capability) {
  if (capability?.mode === "Simulation" && capability?.available === true) {
    return available({
      label: "Send to IC-ENC",
      mode: "Simulation",
    });
  }

  return unavailable(normalizeText(capability?.reason) || SEND_CAPABILITY_UNAVAILABLE_REASON, {
    label: "Send to IC-ENC",
    mode: normalizeText(capability?.mode) || "Disabled",
  });
}

function createMutationAvailability({
  hasDatasetName,
  exportHasRunningAction,
  productHasRunningMutation,
  productOperationDisabledReason,
}) {
  if (!hasDatasetName) {
    return unavailable(MISSING_DATASET_NAME_REASON);
  }
  if (productHasRunningMutation) {
    return unavailable(productOperationDisabledReason);
  }
  if (exportHasRunningAction) {
    return unavailable(EXPORT_RUNNING_REASON);
  }

  return available();
}

function createSendAvailability({
  hasDatasetName,
  frozen,
  productState,
  exportHasRunningAction,
  productHasRunningMutation,
  productOperationDisabledReason,
  capability,
}) {
  const mutationAvailability = createMutationAvailability({
    hasDatasetName,
    exportHasRunningAction,
    productHasRunningMutation,
    productOperationDisabledReason,
  });
  if (mutationAvailability.disabled) {
    return mutationAvailability;
  }
  if (frozen) {
    return unavailable("Unfreeze the product before sending.");
  }
  if (productState.known && !isExportedState(productState)) {
    return unavailable("IC-ENC send simulation is only available when product status is Exported.");
  }

  return createSendToIcEncCapabilityAvailability(capability);
}

function createRollbackAvailability({ productState, ...mutationContext }) {
  const mutationAvailability = createMutationAvailability(mutationContext);
  if (mutationAvailability.disabled) {
    return mutationAvailability;
  }
  if (productState.known && !isRollbackState(productState)) {
    return unavailable(ROLLBACK_STATE_REASON);
  }

  return available();
}

function createExportRootAvailability({
  hasDatasetName,
  exportHasRunningAction,
  productHasRunningMutation,
  productOperationDisabledReason,
}) {
  if (!hasDatasetName) {
    return unavailable(MISSING_DATASET_NAME_REASON);
  }
  if (productHasRunningMutation) {
    return unavailable(productOperationDisabledReason);
  }

  // The root remains openable while a real export runs so leaf-level state can explain the block.
  return available({
    label: exportHasRunningAction ? "Exporting..." : "Export...",
    loading: exportHasRunningAction,
  });
}

function capabilityAvailability(productContext, capabilityName, actionAvailability) {
  if (productContext === undefined) {
    // Preserve the domain API for existing compatibility-only unit callers.
    return actionAvailability;
  }
  if (!productContextSupportsCapability(productContext, capabilityName)) {
    return hidden(getProductContextCapabilityReason(productContext, capabilityName));
  }

  return {
    ...actionAvailability,
    visible: true,
  };
}

function supportsCapability(productContext, capabilityName) {
  if (productContext === undefined) {
    return true;
  }
  if (!capabilityName) {
    return false;
  }

  return productContextSupportsCapability(productContext, capabilityName);
}

function available(extra = {}) {
  return {
    visible: true,
    disabled: false,
    disabledReason: null,
    loading: false,
    label: null,
    ...extra,
  };
}

function unavailable(disabledReason, extra = {}) {
  return {
    visible: true,
    disabled: true,
    disabledReason,
    loading: false,
    label: null,
    ...extra,
  };
}

function hidden(disabledReason) {
  return {
    visible: false,
    disabled: true,
    disabledReason,
    loading: false,
    label: null,
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

function getProductState(attributes) {
  const rawState =
    attributes?.status ?? attributes?.Status ?? attributes?.state ?? attributes?.State ?? null;
  if (rawState === null || rawState === undefined || rawState === "") {
    return { known: false, id: null, name: null };
  }

  const numericState = Number(rawState);
  if (Number.isFinite(numericState)) {
    return {
      known: true,
      id: numericState,
      name: null,
    };
  }

  return {
    known: true,
    id: null,
    name: String(rawState).trim().toLowerCase(),
  };
}

function isIdleState(productState) {
  return productState.id === PRODUCT_STATE_ID.IDLE || productState.name === "idle";
}

function isExportedState(productState) {
  return productState.id === PRODUCT_STATE_ID.EXPORTED || productState.name === "exported";
}

function isRollbackState(productState) {
  return (
    productState.id === PRODUCT_STATE_ID.EXPORTED ||
    productState.id === PRODUCT_STATE_ID.FROZEN ||
    productState.name === "exported" ||
    productState.name === "frozen"
  );
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
