import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";
import { noticeInfo } from "../../notices/services/noticeService.js";
import {
  openAnalyzePage,
  openProductHistory,
  sendImmediately,
  triggerExport,
  triggerFreeze,
} from "./popupProductActions.js";

export function createPopupActionGroups({ attributes, frozen, refreshAndRender } = {}) {
  return [
    [
      createFreezeAction({
        attributes,
        frozen,
        refreshAndRender,
      }),
      createSendAction({
        attributes,
        frozen,
      }),
    ],
    [
      createExportAction({
        attributes,
        frozen,
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

function createFreezeAction({ attributes, frozen, refreshAndRender }) {
  return {
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: frozen ? "Unfreeze" : "Freeze",
    icon: frozen ? "brightness" : "snow",
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      const nextFrozenState = !frozen;
      const result = await triggerFreeze(attributes?.datasetName, nextFrozenState, anchorElement);

      if (!result?.success) {
        return;
      }

      await refreshAndRender?.();
    },
  };
}

function createSendAction({ attributes, frozen }) {
  return {
    id: "send-immediately",
    label: "Send to IC-ENC",
    icon: "send",
    disabled: frozen,
    disabledReason: "Unfreeze the product before sending.",
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      await sendImmediately(attributes?.datasetName, anchorElement);
    },
  };
}

function createExportAction({ attributes, frozen, refreshAndRender }) {
  return {
    id: "export",
    label: "Export...",
    icon: "plus-square",
    className: "popup-action-bar__action--dropdown",
    items: [
      {
        id: "export-all",
        label: "All",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "export-all-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: true,
            scope: "All",
            exportType: "Edition",
            request: exportNewEdition,
            refreshAndRender,
            confirm: {
              title: `Export new edition for ${attributes?.datasetName}`,
              message:
                `Are you sure you want to export a new Edition in ALL formats of ${attributes?.datasetName}? ` +
                "The export will include ALL formats of the product - Currently S57 and S100",
              confirmText: "Export edition",
            },
          }),
          createExportLeafAction({
            id: "export-all-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: true,
            scope: "All",
            exportType: "Update",
            request: exportNewUpdate,
            refreshAndRender,
            confirm: {
              title: `Export new update for ${attributes?.datasetName}`,
              message:
                `Are you sure you want to export a new Update in ALL formats of ${attributes?.datasetName}? ` +
                "The export will include ALL formats of the product - Currently S57 and S100",
              confirmText: "Export update",
            },
          }),
        ],
      },
      {
        id: "export-s57",
        label: "S57",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "s57-export-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: false,
            scope: "S57",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s57-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: false,
            scope: "S57",
            exportType: "Update",
          }),
        ],
      },
      {
        id: "export-s100",
        label: "S100",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "s100-export-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: false,
            scope: "S100",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s100-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: false,
            scope: "S100",
            exportType: "Update",
          }),
        ],
      },
    ],
  };
}

function createExportLeafAction({
  id,
  label,
  icon,
  attributes,
  frozen,
  implemented,
  scope,
  exportType,
  request,
  refreshAndRender,
  confirm,
}) {
  return {
    id,
    label,
    icon,
    disabled: frozen || !implemented,
    disabledReason: getExportDisabledReason({
      frozen,
      implemented,
    }),
    onClick: async ({ anchorElement }) => {
      const result = await triggerExport({
        actionId: id,
        datasetName: attributes?.datasetName,
        scope,
        exportType,
        request,
        anchorElement,
        confirm,
      });

      if (result?.success) {
        await refreshAndRender?.();
      }
    },
  };
}

function getExportDisabledReason({ frozen, implemented }) {
  if (frozen) {
    return "Unfreeze the product before exporting.";
  }

  if (!implemented) {
    return "Feature is not available yet.";
  }

  return null;
}

function createRollbackAction({ attributes }) {
  return {
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    className: "popup-action-bar__action--rollback",
    onClick: () => {
      noticeInfo("Rollback is not available yet", attributes?.datasetName);
    },
  };
}

function createToolsAction({ attributes }) {
  return {
    id: "tools",
    label: "Tools",
    icon: "wrench",
    className: "popup-action-bar__action--dropdown",
    items: [
      {
        id: "analyze",
        label: "Analyze",
        icon: "magnifying-glass",
        onClick: () => {
          openAnalyzePage(attributes?.datasetName);
        },
      },
      {
        id: "history",
        label: "History",
        icon: "clock",
        onClick: () => {
          openProductHistory(attributes?.datasetName);
        },
      },
    ],
  };
}
