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
  const capability =
    resolvedOperationKind === EXPORT_TYPE.UPDATE
      ? PRODUCT_OPERATION_CAPABILITY.EXPORT_UPDATE
      : PRODUCT_OPERATION_CAPABILITY.EXPORT_EDITION;
  const contextAllowsOperation =
    productContext === undefined || productContextSupportsCapability(productContext, capability);
  const configurationAllowsOperation =
    productContext === undefined
      ? resolvedTarget === EXPORT_TARGET.S101
      : productContext?.exportConfiguration?.leaves?.some(
          (leaf) =>
            leaf.id === resolvedActionId &&
            leaf.backendTarget === resolvedTarget &&
            leaf.operationKind === resolvedOperationKind &&
            leaf.implemented
        );

  return (
    contextAllowsOperation &&
    configurationAllowsOperation &&
    resolvedActionId === `export-${String(resolvedOperationKind).toLowerCase()}` &&
    implemented === true &&
    enabled !== false &&
    [EXPORT_TARGET.S57, EXPORT_TARGET.S101].includes(resolvedTarget) &&
    Object.values(EXPORT_TYPE).includes(resolvedOperationKind) &&
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
