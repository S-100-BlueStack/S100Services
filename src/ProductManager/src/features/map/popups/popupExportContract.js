import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";

export const EXPORT_TYPE = Object.freeze({
  EDITION: "Edition",
  UPDATE: "Update",
});

export const SUPPORTED_EXPORT_ACTION_ID = "s100-export-edition";

const SUPPORTED_EXPORT_LEAF = Object.freeze({
  actionId: SUPPORTED_EXPORT_ACTION_ID,
  target: EXPORT_TARGET.S100,
  exportType: EXPORT_TYPE.EDITION,
});

export function isSupportedExportAction({
  id,
  actionId,
  target,
  exportType,
  implemented,
  request,
} = {}) {
  const resolvedActionId = actionId ?? id;

  return (
    resolvedActionId === SUPPORTED_EXPORT_LEAF.actionId &&
    implemented === true &&
    target === SUPPORTED_EXPORT_LEAF.target &&
    exportType === SUPPORTED_EXPORT_LEAF.exportType &&
    typeof request === "function"
  );
}

export function validateExportDispatch(action = {}) {
  if (isSupportedExportAction(action)) {
    return {
      allowed: true,
      reason: null,
    };
  }

  return {
    allowed: false,
    reason: "unsupported-export-action",
  };
}
