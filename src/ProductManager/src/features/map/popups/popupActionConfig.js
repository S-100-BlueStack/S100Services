import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";
import { noticeInfo } from "../../notices/services/noticeService.js";
import { createProductActionAvailability } from "../../products/domain/productActionAvailability.js";
import {
  openAnalyzePage,
  openProductHistory,
  sendImmediately,
  triggerExport,
  triggerFreeze,
  isAnyExportActionRunning,
} from "./popupProductActions.js";

export function createPopupActionGroups({ attributes, frozen, refreshAndRender } = {}) {
  const availability = createProductActionAvailability({
    attributes,
    frozen,
    exportIsRunning: isAnyExportActionRunning(attributes?.datasetName),
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
      }),
    ],
    [
      createExportAction({
        attributes,
        availability,
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

      if (!result?.success) {
        return;
      }

      await refreshAndRender?.();
    },
  };
}

function createSendAction({ attributes, availability }) {
  return {
    id: "send-immediately",
    label: "Send to IC-ENC",
    icon: "send",
    disabled: availability.sendImmediately.disabled,
    disabledReason: availability.sendImmediately.disabledReason,
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      await sendImmediately(attributes?.datasetName, anchorElement);
    },
  };
}

function createExportAction({ attributes, availability, refreshAndRender }) {
  return {
    id: "export",
    label: availability.export.loading ? "Exporting..." : "Export...",
    icon: "plus-square",
    disabled: availability.export.disabled,
    disabledReason: availability.export.disabledReason,
    loading: availability.export.loading,
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
            availability: availability.exports.allEdition,
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
            availability: availability.exports.allUpdate,
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
            availability: availability.exports.s57Edition,
            scope: "S57",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s57-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            availability: availability.exports.s57Update,
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
            availability: availability.exports.s100Edition,
            scope: "S100",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s100-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            availability: availability.exports.s100Update,
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
  availability,
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
    disabled: availability.disabled,
    disabledReason: availability.disabledReason,
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
