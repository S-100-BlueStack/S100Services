import { isStatusFrozen } from "../state/featureState.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createActionButton, updateActionButton } from "./popupActionDom.js";
import { closePopupActionDropdown } from "./popupActionDropdown.js";

const ACTION_ROW_CLASS = "popup-action-bar__row";

export function createPopupActionBar({
  attributes,
  graphic,
  productContext,
  refreshAndRender,
} = {}) {
  const context = productContext ?? resolveProductContext({ graphic, attributes });
  const actionGroups = getActionGroups({
    context,
    graphic,
    attributes,
    refreshAndRender,
  });

  if (actionGroups.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");
  reconcileActionRows(container, actionGroups, { force: true });

  return container;
}

export function updatePopupActionBar(
  container,
  { attributes, graphic, productContext, refreshAndRender, force = false } = {}
) {
  if (!container) {
    return {
      supported: false,
      changed: false,
    };
  }

  const context = productContext ?? resolveProductContext({ graphic, attributes });
  const actionGroups = getActionGroups({
    context,
    graphic,
    attributes,
    refreshAndRender,
  });

  if (actionGroups.length === 0) {
    const changed = container.childElementCount > 0;
    closeOpenDropdownIn(container);
    container.replaceChildren();

    return {
      supported: false,
      changed,
    };
  }

  const changed = reconcileActionRows(container, actionGroups, { force });

  return {
    supported: true,
    changed,
  };
}

function getActionGroups({ context, graphic, attributes, refreshAndRender }) {
  if (!context) {
    return [];
  }

  const resolvedAttributes = attributes ?? graphic?.attributes ?? context.graphic?.attributes ?? {};
  return createPopupActionGroups({
    attributes: resolvedAttributes,
    graphic,
    productContext: context,
    frozen: isStatusFrozen(resolvedAttributes?.status),
    refreshAndRender,
  });
}

function reconcileActionRows(container, actionGroups, { force }) {
  let changed = false;
  const rows = getDirectChildrenByClass(container, ACTION_ROW_CLASS);

  for (let rowIndex = 0; rowIndex < actionGroups.length; rowIndex += 1) {
    const actions = actionGroups[rowIndex];
    let row = rows[rowIndex];

    if (!row) {
      row = createActionRow();
      container.appendChild(row);
      changed = true;
    }

    if (reconcileActionButtons(row, actions, { force })) {
      changed = true;
    }
  }

  for (let rowIndex = actionGroups.length; rowIndex < rows.length; rowIndex += 1) {
    closeOpenDropdownIn(rows[rowIndex]);
    rows[rowIndex].remove();
    changed = true;
  }

  return changed;
}

function reconcileActionButtons(row, actions, { force }) {
  let changed = false;
  const currentActions = Array.from(row.children);

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const actionConfig = actions[actionIndex];
    let action = currentActions[actionIndex];

    if (!action) {
      action = createActionButton(actionConfig);
      row.appendChild(action);
      changed = true;
      continue;
    }

    if (updateActionButton(action, actionConfig, { force })) {
      changed = true;
    }
  }

  for (let actionIndex = actions.length; actionIndex < currentActions.length; actionIndex += 1) {
    closeOpenDropdownForAction(currentActions[actionIndex]);
    currentActions[actionIndex].remove();
    changed = true;
  }

  return changed;
}

function createActionRow() {
  const row = document.createElement("div");
  row.className = ACTION_ROW_CLASS;
  return row;
}

function getDirectChildrenByClass(container, className) {
  return Array.from(container.children).filter((child) => {
    return child.classList.contains(className);
  });
}

function closeOpenDropdownIn(container) {
  const openAction = container.querySelector?.('[aria-expanded="true"]');
  if (openAction) {
    closePopupActionDropdown();
  }
}

function closeOpenDropdownForAction(action) {
  if (action?.getAttribute?.("aria-expanded") === "true") {
    closePopupActionDropdown();
  }
}
