import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";
import { noticeInfo } from "../../notices/services/noticeService.js";
import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "../../products/domain/productActionAvailability.js";
import {
  PRODUCT_OPERATION_TYPE,
  getProductOperationState,
} from "../../products/state/productOperationState.js";
import { getPopupExportActionState, isAnyPopupExportActionRunning } from "./popupExportState.js";
import {
  openAnalyzePage,
  openProductHistory,
  sendImmediately,
  triggerExport,
  triggerFreeze,
} from "./popupProductActions.js";

const EXPORT_GROUPS = [
  {
    id: "export-all",
    label: "All",
    icon: "plus-square",
    scope: "All",
    actions: [
      {
        id: "export-all-edition",
        label: "Edition",
        icon: "notepad-add",
        exportType: "Edition",
        implemented: true,
        request: exportNewEdition,
        createConfirm: (datasetName) => ({
          title: `Export new edition for ${datasetName}`,
          message:
            `Are you sure you want to export a new Edition in ALL formats of ${datasetName}? ` +
            "The export will include ALL formats of the product - Currently S57 and S100",
          confirmText: "Export edition",
        }),
      },
      {
        id: "export-all-update",
        label: "Update",
        icon: "notepad-edit",
        exportType: "Update",
        implemented: true,
        request: exportNewUpdate,
        createConfirm: (datasetName) => ({
          title: `Export new update for ${datasetName}`,
          message:
            `Are you sure you want to export a new Update in ALL formats of ${datasetName}? ` +
            "The export will include ALL formats of the product - Currently S57 and S100",
          confirmText: "Export update",
        }),
      },
    ],
  },
  {
    id: "export-s57",
    label: "S57",
    icon: "plus-square",
    scope: "S57",
    actions: [
      {
        id: "s57-export-edition",
        label: "Edition",
        icon: "notepad-add",
        exportType: "Edition",
        implemented: false,
      },
      {
        id: "s57-export-update",
        label: "Update",
        icon: "notepad-edit",
        exportType: "Update",
        implemented: false,
      },
    ],
  },
  {
    id: "export-s100",
    label: "S100",
    icon: "plus-square",
    scope: "S100",
    actions: [
      {
        id: "s100-export-edition",
        label: "Edition",
        icon: "notepad-add",
        exportType: "Edition",
        implemented: false,
      },
      {
        id: "s100-export-update",
        label: "Update",
        icon: "notepad-edit",
        exportType: "Update",
        implemented: false,
      },
    ],
  },
];

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
      }),
      createToolsAction({
        attributes,
      }),
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
    label: getFreezeActionLabel({
      frozen,
      operationIsRunning,
    }),
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
    disabled: availability.exportRoot.disabled,
    disabledReason: availability.exportRoot.disabledReason,
    className: "popup-action-bar__action--dropdown",
    items: EXPORT_GROUPS.map((group) =>
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

function createRollbackAction({ attributes }) {
  return {
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    disabled: true,
    disabledReason: "Feature is not available yet.",
    className: "popup-action-bar__action--rollback",
    onClick: () => {
      noticeInfo("Rollback is not available yet", attributes?.datasetName);
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
