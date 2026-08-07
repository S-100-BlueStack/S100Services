import { exportNewEdition } from "../../data/api/exportApi.js";
import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { productContextSupportsCapability } from "../../products/domain/productContext.js";
import { EXPORT_TYPE, SUPPORTED_EXPORT_ACTION_ID } from "./popupExportContract.js";

export const EXPORT_SCOPE = EXPORT_TARGET;
export { EXPORT_TARGET, EXPORT_TYPE };

const EXPORT_ACTION_ICON = Object.freeze({
  [EXPORT_TYPE.EDITION]: "notepad-add",
  [EXPORT_TYPE.UPDATE]: "notepad-edit",
});

const EXPORT_HANDLERS = Object.freeze({
  "export-new-edition": exportNewEdition,
});

const ALLOWED_VISIBLE_OPERATION_KINDS = new Set([EXPORT_TYPE.EDITION, EXPORT_TYPE.UPDATE]);

export function createPopupExportActions(productContext) {
  const configuration = productContext?.exportConfiguration;
  if (
    !configuration?.visible ||
    !productContextSupportsCapability(productContext, "popupExport") ||
    !Array.isArray(configuration.leaves)
  ) {
    return [];
  }

  return configuration.leaves
    .filter(isVisibleSupportedLeafDefinition)
    .map((leaf) => createExportAction(leaf, productContext));
}

function createExportAction(leaf, productContext) {
  const operationKind = leaf.operationKind;
  const handler = leaf.handlerId ? (EXPORT_HANDLERS[leaf.handlerId] ?? null) : null;
  const capabilitySupported = productContextSupportsCapability(productContext, leaf.capability);
  const implemented = leaf.implemented === true && typeof handler === "function";
  const enabled = capabilitySupported && implemented;

  return Object.freeze({
    id: leaf.id,
    label: operationKind,
    icon: EXPORT_ACTION_ICON[operationKind],
    operationKind,
    visible: true,
    enabled,
    implemented,
    backendTarget: leaf.backendTarget ?? null,
    availabilityReason:
      leaf.availabilityReason ??
      (enabled
        ? null
        : `${productContext.sourceLabel ?? "Selected source"} export is not available yet.`),
    handler,
    capability: leaf.capability,
    productContext,

    // Compatibility aliases keep the established popup operation pipeline intact.
    target: leaf.backendTarget ?? null,
    exportType: operationKind,
    request: handler,
    createConfirm: createConfirmationFactory(leaf.confirmation),
  });
}

function isVisibleSupportedLeafDefinition(leaf) {
  return Boolean(
    leaf?.visible !== false && leaf?.id && ALLOWED_VISIBLE_OPERATION_KINDS.has(leaf.operationKind)
  );
}

function createConfirmationFactory(confirmation) {
  if (!confirmation) {
    return null;
  }

  return (datasetName) => ({
    title: replaceDatasetName(confirmation.title, datasetName),
    message: replaceDatasetName(confirmation.message, datasetName),
    confirmText: confirmation.confirmText,
  });
}

function replaceDatasetName(value, datasetName) {
  return String(value ?? "").replaceAll("{datasetName}", String(datasetName ?? ""));
}

export function getSupportedCompatibilityExportActionId() {
  return SUPPORTED_EXPORT_ACTION_ID;
}
