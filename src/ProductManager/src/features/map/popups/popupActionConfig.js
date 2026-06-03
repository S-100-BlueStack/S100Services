import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";
import { noticeInfo } from "../../notices/services/noticeService.js";
import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "../../products/domain/productActionAvailability.js";
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
  const availability = createProductActionAvailability({
    attributes,
    frozen,
    exportHasRunningAction: isAnyPopupExportActionRunning(datasetName),
  });

  return [
    [
      createFreezeAction({
        attributes,
        frozen,
        availability,
        refreshAndRender,
      }),
      createSendAction({
        attributes,
        availability,
        refreshAndRender,
      }),
    ],
    [
      createExportAction({
        attributes,
        frozen,
        availability,
        refreshAndRender,
      }),
      createRollbackAction({
        attributes,
        availability,
      }),
      createToolsAction({
        attributes,
      }),
    ],
  ];
}

function createFreezeAction({ attributes, frozen, availability, refreshAndRender }) {
  const actionAvailability = frozen ? availability.unfreeze : availability.freeze;

  return {
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: frozen ? "Unfreeze" : "Freeze",
    icon: frozen ? "brightness" : "snow",
    disabled: actionAvailability.disabled,
    disabledReason: actionAvailability.disabledReason,
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      const nextFrozenState = !frozen;
      const result = await triggerFreeze(attributes?.datasetName, nextFrozenState, anchorElement);

      if (shouldRefreshAfterProductAction(result)) {
        await refreshAndRender?.();
      }
    },
  };
}

function createSendAction({ attributes, availability, refreshAndRender }) {
  return {
    id: "send-immediately",
    label: "Send to IC-ENC",
    icon: "send",
    disabled: availability.sendImmediately.disabled,
    disabledReason: availability.sendImmediately.disabledReason,
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      const result = await sendImmediately(attributes?.datasetName, anchorElement);

      if (shouldRefreshAfterProductAction(result)) {
        await refreshAndRender?.();
      }
    },
  };
}

function createExportAction({ attributes, frozen, availability, refreshAndRender }) {
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
        refreshAndRender,
      })
    ),
  };
}

function createExportGroupAction({ group, attributes, frozen, refreshAndRender }) {
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
        refreshAndRender,
      })
    ),
  };
}

function createExportLeafAction({ group, exportAction, attributes, frozen, refreshAndRender }) {
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
  });

  return {
    id: exportAction.id,
    label: availability.label ?? exportAction.label,
    icon: exportAction.icon,
    loading: availability.loading,
    disabled: availability.disabled,
    disabledReason: availability.disabledReason,
    onClick: async ({ anchorElement }) => {
      const result = await triggerExport({
        datasetName,
        scope: group.scope,
        exportType: exportAction.exportType,
        request: exportAction.request,
        anchorElement,
        confirm: exportAction.createConfirm?.(datasetName),
      });

      if (shouldRefreshAfterProductAction(result)) {
        await refreshAndRender?.();
      }
    },
  };
}

function createRollbackAction({ attributes, availability }) {
  return {
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    disabled: availability.rollback.disabled,
    disabledReason: availability.rollback.disabledReason,
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

function shouldRefreshAfterProductAction(result) {
  return Boolean(result && result.skipped !== true);
}
