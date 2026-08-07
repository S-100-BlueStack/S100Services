import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import {
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
} from "../../products/domain/productContext.js";

export const EXPORT_TYPE = Object.freeze({
  EDITION: "Edition",
  UPDATE: "Update",
});

export const SUPPORTED_EXPORT_ACTION_ID = "export-edition";

const SUPPORTED_COMPATIBILITY_EXPORT = Object.freeze({
  actionId: SUPPORTED_EXPORT_ACTION_ID,
  target: EXPORT_TARGET.S100,
  exportType: EXPORT_TYPE.EDITION,
});

export function isSupportedExportAction({
  id,
  actionId,
  target,
  backendTarget,
  exportType,
  operationKind,
  implemented,
  enabled = true,
  request,
  handler,
  productContext,
} = {}) {
  const resolvedActionId = actionId ?? id;
  const resolvedTarget = backendTarget ?? target;
  const resolvedOperationKind = operationKind ?? exportType;
  const resolvedHandler = handler ?? request;
  const contextAllowsEdition =
    productContext === undefined ||
    productContextSupportsCapability(productContext, PRODUCT_OPERATION_CAPABILITY.EXPORT_EDITION);

  return (
    contextAllowsEdition &&
    resolvedActionId === SUPPORTED_COMPATIBILITY_EXPORT.actionId &&
    implemented === true &&
    enabled !== false &&
    resolvedTarget === SUPPORTED_COMPATIBILITY_EXPORT.target &&
    resolvedOperationKind === SUPPORTED_COMPATIBILITY_EXPORT.exportType &&
    typeof resolvedHandler === "function"
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
