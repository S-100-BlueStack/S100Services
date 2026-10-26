import {
  createPackagePopupPresentation,
  isCurrentPackagePopupContext,
} from "./packagePopupPresentation.js";
import { createPopupWorkflowActions } from "./popupWorkflowActions.js";
import {
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import { openAnalyzePage, openReviewPage, openProductHistory } from "./popupProductActions.js";

/** All Products expose the same popup controls; only verified owners may dispatch. */
export function createPopupActionGroups({
  attributes,
  graphic,
  productContext,
  packageActions,
} = {}) {
  const context = productContext ?? resolveProductContext({ graphic, attributes });
  if (!context) return [];

  const selectedGraphic = graphic ?? context.graphic;
  const resolvedAttributes = attributes ?? selectedGraphic?.attributes ?? {};
  const isPackage = context.workUnit?.kind === "package";
  const actionState = isPackage ? packageActions?.projection() : null;
  const packagePresentation = isPackage
    ? createPackagePopupPresentation({
        productContext: context,
        graphic: selectedGraphic,
        attributes: resolvedAttributes,
        workflowPresentation: actionState,
      })
    : null;

  // A structurally invalid package is not allowed to fall back to standalone actions.
  if (isPackage && !packagePresentation) return [];

  const actions = packagePresentation?.actions ?? createPopupWorkflowActions();
  const selectedSource = selectedGraphic?.layer?.appSourceDefinition;
  const isCurrent = () => {
    if (!selectedGraphic) return true;
    if (selectedGraphic.layer?.appSourceDefinition !== selectedSource) return false;
    if (isPackage) {
      return isCurrentPackagePopupContext(context, selectedGraphic.attributes, selectedGraphic);
    }
    if (selectedGraphic.visible === false || selectedGraphic.layer?.visible === false) return false;
    const latest = resolveProductContext({ graphic: selectedGraphic });
    return latest?.identityKey === context.identityKey;
  };

  for (const action of actions) {
    action.isCurrent = isCurrent;
    const enabled =
      isPackage &&
      action.availability.backendAuthorized === true &&
      typeof packageActions?.invoke === "function";
    if (isPackage && actionState && !enabled) {
      action.disabledReason = getUnavailableActionReason(action.operation, actionState);
    }
    if (enabled && isCurrent()) {
      action.controlKind = "live-package";
      action.disabled = false;
      action.disabledReason = null;
      action.availability = { ...action.availability, dispatchImplemented: true };
      action.onClick = () => packageActions.invoke(action.operation);
    }
  }

  const tools = createToolsAction({ context, attributes: resolvedAttributes, graphic });
  if (tools) {
    tools.isCurrent = isCurrent;
    tools.items = tools.items.map((item) => ({
      ...item,
      onClick: (options) => {
        if (options?.anchorElement?.isConnected && isCurrent()) item.onClick(options);
      },
    }));
  }
  return [[...actions, ...(tools ? [tools] : [])]];
}

function getUnavailableActionReason(operation, state) {
  if (!state.liveVerified) {
    return state.restrictionCode === "PACKAGE_NOT_FOUND"
      ? `No S-101 and S-57 package is available to ${operation}.`
      : `Unable to ${operation} this package right now.`;
  }
  if (state.primaryAction === "accept" && operation !== "accept") {
    return "Accept the results before continuing.";
  }
  if (["MEMBER_TRACK_MISSING", "MEMBERS_NOT_READY"].includes(state.restrictionCode)) {
    return `This package is not ready to ${operation}.`;
  }
  if (operation === "send" && state.paused) return "Resume the package before sending.";
  return `Unable to ${operation} this package right now.`;
}

function createToolsAction({ context, attributes, graphic }) {
  const items = [];

  if (productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.ANALYZE)) {
    items.push({
      id: "analyze",
      label: "Analyze",
      icon: "magnifying-glass",
      onClick: () => openAnalyzePage(context.datasetName ?? attributes?.datasetName),
    });
  }
  if (
    !isAnalyzeRoute() &&
    productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.REVIEW)
  ) {
    items.push({
      id: "review",
      label: "Review",
      icon: "list",
      onClick: () => openReviewPage(context.datasetName ?? attributes?.datasetName),
    });
  }
  if (
    !isAnalyzeRoute() &&
    productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.HISTORY)
  ) {
    items.push({
      id: "history",
      label: "History",
      icon: "clock",
      onClick: () =>
        openProductHistory(context.datasetName ?? attributes?.datasetName, {
          productContext: context,
          graphic: graphic ?? context.graphic,
        }),
    });
  }
  return {
    id: "tools",
    label: "Tools",
    ariaLabel: "Tools",
    icon: "wrench",
    textEnabled: false,
    disabled: items.length === 0,
    disabledReason: items.length ? null : "No tools are available for this product.",
    className: "popup-action-bar__action--dropdown",
    items,
  };
}

function isAnalyzeRoute() {
  return Boolean(globalThis.document?.body?.classList?.contains("pc-analyze-route"));
}
