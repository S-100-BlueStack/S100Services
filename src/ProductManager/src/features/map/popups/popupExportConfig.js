import { exportNewEdition } from "../../data/api/exportApi.js";
import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { EXPORT_TYPE, SUPPORTED_EXPORT_ACTION_ID } from "./popupExportContract.js";

export const EXPORT_SCOPE = EXPORT_TARGET;
export { EXPORT_TARGET, EXPORT_TYPE };

const EXPORT_ACTION_ICON = Object.freeze({
  [EXPORT_TYPE.EDITION]: "notepad-add",
  [EXPORT_TYPE.UPDATE]: "notepad-edit",
});

export const POPUP_EXPORT_GROUPS = [
  createExportGroup({
    id: "export-all",
    label: "All",
    scope: EXPORT_TARGET.ALL,
    actions: [
      createFutureExportAction({
        id: "export-all-edition",
        target: EXPORT_TARGET.ALL,
        exportType: EXPORT_TYPE.EDITION,
      }),
      createFutureExportAction({
        id: "export-all-update",
        target: EXPORT_TARGET.ALL,
        exportType: EXPORT_TYPE.UPDATE,
      }),
    ],
  }),
  createExportGroup({
    id: "export-s57",
    label: "S57",
    scope: EXPORT_TARGET.S57,
    actions: [
      createFutureExportAction({
        id: "s57-export-edition",
        target: EXPORT_TARGET.S57,
        exportType: EXPORT_TYPE.EDITION,
      }),
      createFutureExportAction({
        id: "s57-export-update",
        target: EXPORT_TARGET.S57,
        exportType: EXPORT_TYPE.UPDATE,
      }),
    ],
  }),
  createExportGroup({
    id: "export-s100",
    label: "S100",
    scope: EXPORT_TARGET.S100,
    actions: [
      createImplementedExportAction({
        id: SUPPORTED_EXPORT_ACTION_ID,
        target: EXPORT_TARGET.S100,
        exportType: EXPORT_TYPE.EDITION,
        request: exportNewEdition,
        createConfirm: createS100EditionConfirm,
      }),
      createFutureExportAction({
        id: "s100-export-update",
        target: EXPORT_TARGET.S100,
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

function createImplementedExportAction({ id, target, exportType, request, createConfirm }) {
  return {
    id,
    label: exportType,
    icon: EXPORT_ACTION_ICON[exportType],
    target,
    exportType,
    implemented: true,
    request,
    createConfirm,
  };
}

function createFutureExportAction({ id, target, exportType }) {
  return {
    id,
    label: exportType,
    icon: EXPORT_ACTION_ICON[exportType],
    target,
    exportType,
    implemented: false,
    // Add the endpoint request here and set `implemented` to true when the
    // backend supports this export.
    request: null,
  };
}

function createS100EditionConfirm(datasetName) {
  return {
    title: `Export S100 edition for ${datasetName}`,
    message: `Are you sure you want to export a new S100 Edition for ${datasetName}?`,
    confirmText: "Export edition",
  };
}
