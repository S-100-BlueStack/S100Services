import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "../../products/domain/productActionAvailability.js";
import {
  PRODUCT_OPERATION_TYPE,
  getProductOperationState,
} from "../../products/state/productOperationState.js";
import { getPopupExportActionState, isAnyPopupExportActionRunning } from "./popupExportState.js";
import { POPUP_EXPORT_GROUPS } from "./popupExportConfig.js";
import {
  openAnalyzePage,
  openProductHistory,
  sendImmediately,
  triggerExport,
  triggerFreeze,
  triggerRollback,
} from "./popupProductActions.js";

export function createPopupActionGroups({ attributes, frozen, refreshAndRender } = {}) {
  const datasetName = getDatasetName(attributes);
  const productOperationState = getProductOperationState(datasetName);
  const productHasRunningNonExportMutation =
    hasRunningNonExportProductOperation(productOperationState);
  const availability = createProductActionAvailability({
    attributes,
    frozen,
    exportHasRunningAction: isAnyPopupExportActionRunning(datasetName),
    productHasRunningMutation: productHasRunningNonExportMutation,
    productOperationDisabledReason: productOperationState.disabledReason,
  });

  return [
    [
      createFreezeAction({
        attributes,
        frozen,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createSendAction({
        attributes,
        availability,
        productOperationState,
        refreshAndRender,
      }),
    ],
    [
      createExportAction({
        attributes,
        frozen,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createRollbackAction({
        attributes,
        availability,
        productOperationState,
        refreshAndRender,
      }),
      createToolsAction({ attributes }),
    ],
  ];
}

function createFreezeAction({
  attributes,
  frozen,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  const operationType = frozen ? PRODUCT_OPERATION_TYPE.UNFREEZE : PRODUCT_OPERATION_TYPE.FREEZE;
  const operationIsRunning = isOperationTypeRunning(productOperationState, operationType);
  const actionAvailability = frozen ? availability.unfreeze : availability.freeze;

  return {
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: getFreezeActionLabel({ frozen, operationIsRunning }),
    icon: frozen ? "brightness" : "snow",
    loading: operationIsRunning,
    disabled: actionAvailability.disabled,
    disabledReason: actionAvailability.disabledReason,
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      const nextFrozenState = !frozen;
      await triggerFreeze(attributes?.datasetName, nextFrozenState, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createSendAction({ attributes, availability, productOperationState, refreshAndRender }) {
  const operationIsRunning = isOperationTypeRunning(
    productOperationState,
    PRODUCT_OPERATION_TYPE.SEND
  );

  return {
    id: "send-immediately",
    label: operationIsRunning ? "Sending..." : "Send to IC-ENC",
    icon: "send",
    loading: operationIsRunning,
    disabled: availability.sendImmediately.disabled,
    disabledReason: availability.sendImmediately.disabledReason,
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      await sendImmediately(attributes?.datasetName, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createExportAction({
  attributes,
  frozen,
  availability,
  productOperationState,
  refreshAndRender,
}) {
  return {
    id: "export",
    label: availability.exportRoot.label ?? "Export...",
    icon: "plus-square",
    loading: availability.exportRoot.loading,
    disabled: availability.exportRoot.disabled,
    disabledReason: availability.exportRoot.disabledReason,
    className: "popup-action-bar__action--dropdown",
    items: POPUP_EXPORT_GROUPS.map((group) =>
      createExportGroupAction({
        group,
        attributes,
        frozen,
        productOperationState,
        refreshAndRender,
      })
    ),
  };
}

function createExportGroupAction({
  group,
  attributes,
  frozen,
  productOperationState,
  refreshAndRender,
}) {
  return {
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.actions.map((exportAction) =>
      createExportLeafAction({
        group,
        exportAction,
        attributes,
        frozen,
        productOperationState,
        refreshAndRender,
      })
    ),
  };
}

function createExportLeafAction({
  group,
  exportAction,
  attributes,
  frozen,
  productOperationState,
  refreshAndRender,
}) {
  const datasetName = getDatasetName(attributes);
  const exportState = getPopupExportActionState({
    datasetName,
    scope: group.scope,
    exportType: exportAction.exportType,
  });
  const availability = createProductExportAvailability({
    attributes,
    frozen,
    implemented: exportAction.implemented,
    exportState,
    productHasRunningMutation: hasRunningNonExportProductOperation(productOperationState),
    productOperationDisabledReason: productOperationState.disabledReason,
  });

  return {
    id: exportAction.id,
    label: availability.label ?? exportAction.label,
    icon: exportAction.icon,
    loading: availability.loading,
    disabled: availability.disabled,
    disabledReason: availability.disabledReason,
    onClick: async ({ anchorElement }) => {
      await triggerExport({
        datasetName,
        scope: group.scope,
        exportType: exportAction.exportType,
        request: exportAction.request,
        anchorElement,
        confirm: exportAction.createConfirm?.(datasetName),
        afterResult: refreshAndRender,
      });
    },
  };
}

function createRollbackAction({
  attributes,
  availability,
  productOperationState,
  refreshAndRender,
}) {
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
      await triggerRollback(attributes?.datasetName, anchorElement, {
        afterResult: refreshAndRender,
      });
    },
  };
}

function createToolsAction({ attributes }) {
  const items = [
    {
      id: "analyze",
      label: "Analyze",
      icon: "magnifying-glass",
      onClick: () => {
        openAnalyzePage(attributes?.datasetName);
      },
    },
  ];

  if (!isAnalyzeRoute()) {
    items.push({
      id: "history",
      label: "History",
      icon: "clock",
      onClick: () => {
        openProductHistory(attributes?.datasetName);
      },
    });
  }

  return {
    id: "tools",
    label: "Tools",
    icon: "wrench",
    className: "popup-action-bar__action--dropdown",
    items,
  };
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
  return document.body.classList.contains("pm-analyze-route");
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
