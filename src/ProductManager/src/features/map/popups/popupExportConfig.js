import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";

export const EXPORT_SCOPE = Object.freeze({
  ALL: "All",
  S57: "S57",
  S100: "S100",
});

export const EXPORT_TYPE = Object.freeze({
  EDITION: "Edition",
  UPDATE: "Update",
});

const EXPORT_ACTION_ICON = Object.freeze({
  [EXPORT_TYPE.EDITION]: "notepad-add",
  [EXPORT_TYPE.UPDATE]: "notepad-edit",
});

export const POPUP_EXPORT_GROUPS = [
  createExportGroup({
    id: "export-all",
    label: "All",
    scope: EXPORT_SCOPE.ALL,
    actions: [
      createImplementedExportAction({
        id: "export-all-edition",
        exportType: EXPORT_TYPE.EDITION,
        request: exportNewEdition,
        createConfirm: createAllEditionConfirm,
      }),
      createImplementedExportAction({
        id: "export-all-update",
        exportType: EXPORT_TYPE.UPDATE,
        request: exportNewUpdate,
        createConfirm: createAllUpdateConfirm,
      }),
    ],
  }),

  createExportGroup({
    id: "export-s57",
    label: "S57",
    scope: EXPORT_SCOPE.S57,
    actions: [
      createFutureExportAction({
        id: "s57-export-edition",
        exportType: EXPORT_TYPE.EDITION,
      }),
      createFutureExportAction({
        id: "s57-export-update",
        exportType: EXPORT_TYPE.UPDATE,
      }),
    ],
  }),

  createExportGroup({
    id: "export-s100",
    label: "S100",
    scope: EXPORT_SCOPE.S100,
    actions: [
      createFutureExportAction({
        id: "s100-export-edition",
        exportType: EXPORT_TYPE.EDITION,
      }),
      createFutureExportAction({
        id: "s100-export-update",
        exportType: EXPORT_TYPE.UPDATE,
      }),
    ],
  }),
];

function createExportGroup({ id, label, scope, actions }) {
  return {
    id,
    label,
    icon: "plus-square",
    scope,
    actions,
  };
}

function createImplementedExportAction({ id, exportType, request, createConfirm }) {
  return {
    id,
    label: exportType,
    icon: EXPORT_ACTION_ICON[exportType],
    exportType,
    implemented: true,
    request,
    createConfirm,
  };
}

function createFutureExportAction({ id, exportType }) {
  return {
    id,
    label: exportType,
    icon: EXPORT_ACTION_ICON[exportType],
    exportType,
    implemented: false,

    // Add the endpoint request here and set `implemented` to true when the
    // backend supports this export.
    request: null,
  };
}

function createAllEditionConfirm(datasetName) {
  return {
    title: `Export new edition for ${datasetName}`,
    message:
      `Are you sure you want to export a new Edition in ALL formats of ${datasetName}? ` +
      "The export will include ALL formats of the product - Currently S57 and S100",
    confirmText: "Export edition",
  };
}

function createAllUpdateConfirm(datasetName) {
  return {
    title: `Export new update for ${datasetName}`,
    message:
      `Are you sure you want to export a new Update in ALL formats of ${datasetName}? ` +
      "The export will include ALL formats of the product - Currently S57 and S100",
    confirmText: "Export update",
  };
}
