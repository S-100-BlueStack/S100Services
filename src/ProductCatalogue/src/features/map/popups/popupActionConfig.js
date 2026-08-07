import { getSendToIcEncCapability } from "../../data/stores/capabilityStore.js";
import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "../../products/domain/productActionAvailability.js";
import {
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import {
  getExternalProductExportState,
  hasRunningProductExportOperation,
  mergeProductExportStates,
} from "../../products/domain/productExternalExportState.js";
import {
  PRODUCT_OPERATION_TYPE,
  getProductOperationState,
} from "../../products/state/productOperationState.js";
import { getPopupExportActionState, isAnyPopupExportActionRunning } from "./popupExportState.js";
import { createPopupExportActions } from "./popupExportConfig.js";
import { isSupportedExportAction } from "./popupExportContract.js";
import {
  openAnalyzePage,
  openProductHistory,
  sendImmediately,
  triggerExport,
  triggerFreeze,
  triggerRollback,
} from "./popupProductActions.js";

export function createPopupActionGroups({
  attributes,
  graphic,
  productContext,
  frozen,
  refreshAndRender,
} = {}) {
  const context = productContext ?? resolveProductContext({ graphic, attributes });
  if (!context) {
    return [];
  }

  const resolvedAttributes = attributes ?? context.graphic?.attributes ?? {};
  const datasetName = context.datasetName;
  const productOperationState = getProductOperationState(datasetName);
  const productHasRunningNonExportMutation =
    hasRunningNonExportProductOperation(productOperationState);
  const availability = createProductActionAvailability({
    attributes: resolvedAttributes,
    productContext: context,
    frozen,
    exportHasRunningAction:
      isAnyPopupExportActionRunning(context) ||
      hasRunningProductExportOperation(productOperationState),
    productHasRunningMutation: productHasRunningNonExportMutation,
    productOperationDisabledReason: productOperationState.disabledReason,
    sendToIcEncCapability: getSendToIcEncCapability(),
  });

  return [
    compactActions([
      createFreezeAction({
        context,
        attributes: resolvedAttributes,
        frozen,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createSendAction({
        context,
        attributes: resolvedAttributes,
        availability,
        productOperationState,
        refreshAndRender,
      }),
    ]),
    compactActions([
      createExportAction({
        context,
        attributes: resolvedAttributes,
        frozen,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createRollbackAction({
        context,
        attributes: resolvedAttributes,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createToolsAction({ context, attributes: resolvedAttributes }),
    ]),
  ].filter((actions) => actions.length > 0);
}

function createFreezeAction({
  context,
  attributes,
  frozen,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  const actionAvailability = frozen ? availability.unfreeze : availability.freeze;
  if (!actionAvailability.visible) {
    return null;
  }

  const operationType = frozen ? PRODUCT_OPERATION_TYPE.UNFREEZE : PRODUCT_OPERATION_TYPE.FREEZE;
  const operationIsRunning = isOperationTypeRunning(productOperationState, operationType);

  return {
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: getFreezeActionLabel({ frozen, operationIsRunning }),
    icon: frozen ? "brightness" : "snow",
    loading: operationIsRunning,
    disabled: actionAvailability.disabled,
    disabledReason: actionAvailability.disabledReason,
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      await triggerFreeze(context.datasetName ?? attributes?.datasetName, !frozen, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createSendAction({
  context,
  attributes,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  if (!availability.sendImmediately.visible) {
    return null;
  }

  const operationIsRunning = isOperationTypeRunning(
    productOperationState,
    PRODUCT_OPERATION_TYPE.SEND
  );

  return {
    id: "send-immediately",
    label: availability.sendImmediately.label ?? "Send to IC-ENC",
    icon: "send",
    loading: operationIsRunning,
    disabled: availability.sendImmediately.disabled,
    disabledReason: availability.sendImmediately.disabledReason,
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      await sendImmediately(context.datasetName ?? attributes?.datasetName, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createExportAction({
  context,
  attributes,
  frozen,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  if (!availability.exportRoot.visible) {
    return null;
  }

  const items = createPopupExportActions(context).map((exportAction) =>
    createExportLeafAction({
      context,
      exportAction,
      attributes,
      frozen,
      productOperationState,
      refreshAndRender,
    })
  );

  if (items.length === 0) {
    return null;
  }

  return {
    id: "export",
    label: availability.exportRoot.label ?? "Export...",
    icon: "plus-square",
    loading: availability.exportRoot.loading,
    disabled: availability.exportRoot.disabled,
    disabledReason: availability.exportRoot.disabledReason,
    className: "popup-action-bar__action--dropdown",
    items,
  };
}

function createExportLeafAction({
  context,
  exportAction,
  attributes,
  frozen,
  productOperationState,
  refreshAndRender,
}) {
  const datasetName = context.datasetName;
  const stateScope = exportAction.backendTarget ?? context.sourceId;
  const localExportState = getPopupExportActionState({
    productContext: context,
    datasetName,
    scope: stateScope,
    exportType: exportAction.operationKind,
  });
  const externalExportState = exportAction.backendTarget
    ? getExternalProductExportState({
        productOperationState,
        target: exportAction.backendTarget,
        exportType: exportAction.operationKind,
      })
    : null;
  const exportState = mergeProductExportStates(localExportState, externalExportState);
  const implemented = isSupportedExportAction({
    ...exportAction,
    productContext: context,
  });
  const availability = createProductExportAvailability({
    attributes,
    productContext: context,
    capabilityName: exportAction.capability,
    availabilityReason: exportAction.availabilityReason,
    frozen,
    implemented,
    exportState,
    productHasRunningMutation: hasRunningNonExportProductOperation(productOperationState),
    productOperationDisabledReason: productOperationState.disabledReason,
  });

  const action = {
    id: exportAction.id,
    label: availability.label ?? exportAction.label,
    icon: exportAction.icon,
    loading: availability.loading,
    disabled: availability.disabled,
    disabledReason: availability.disabledReason,
  };

  if (!implemented) {
    return action;
  }

  return {
    ...action,
    onClick: async ({ anchorElement }) => {
      await triggerExport({
        datasetName,
        actionId: exportAction.id,
        target: exportAction.backendTarget,
        exportType: exportAction.operationKind,
        implemented: exportAction.implemented,
        request: exportAction.handler,
        anchorElement,
        confirm: exportAction.createConfirm?.(datasetName),
        afterResult: refreshAndRender,
      });
    },
  };
}

function createRollbackAction({
  context,
  attributes,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  if (!availability.rollback.visible) {
    return null;
  }

  const operationIsRunning = isOperationTypeRunning(
    productOperationState,
    PRODUCT_OPERATION_TYPE.ROLLBACK
  );

  return {
    id: "rollback",
    label: operationIsRunning ? "Rolling back..." : "Rollback",
    icon: "undo",
    loading: operationIsRunning,
    disabled: availability.rollback.disabled,
    disabledReason: availability.rollback.disabledReason,
    className: "popup-action-bar__action--rollback",
    onClick: async ({ anchorElement }) => {
      await triggerRollback(context.datasetName ?? attributes?.datasetName, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createToolsAction({ context, attributes }) {
  const items = [];

  if (productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.ANALYZE)) {
    items.push({
      id: "analyze",
      label: "Analyze",
      icon: "magnifying-glass",
      onClick: () => {
        openAnalyzePage(context.datasetName ?? attributes?.datasetName);
      },
    });
  }

  if (
    !isAnalyzeRoute() &&
    productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.HISTORY)
  ) {
    items.push({
      id: "history",
      label: "History",
      icon: "clock",
      onClick: () => {
        openProductHistory(context.datasetName ?? attributes?.datasetName);
      },
    });
  }

  if (items.length === 0) {
    return null;
  }

  return {
    id: "tools",
    label: "Tools",
    icon: "wrench",
    className: "popup-action-bar__action--dropdown",
    items,
  };
}

function compactActions(actions) {
  return actions.filter(Boolean);
}

function getFreezeActionLabel({ frozen, operationIsRunning }) {
  if (!operationIsRunning) {
    return frozen ? "Unfreeze" : "Freeze";
  }

  return frozen ? "Unfreezing..." : "Freezing...";
}

function isOperationTypeRunning(productOperationState, operationType) {
  return Boolean(
    productOperationState?.operations?.some((operation) => operation.type === operationType) ??
    productOperationState?.operation?.type === operationType
  );
}

function hasRunningNonExportProductOperation(productOperationState) {
  return Boolean(
    productOperationState?.operations?.some((operation) => {
      return operation.type !== PRODUCT_OPERATION_TYPE.EXPORT;
    }) ??
    (productOperationState?.running &&
      productOperationState.operation?.type !== PRODUCT_OPERATION_TYPE.EXPORT)
  );
}

function isAnalyzeRoute() {
  return Boolean(globalThis.document?.body?.classList?.contains("pc-analyze-route"));
}
