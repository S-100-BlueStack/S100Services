import { isStatusFrozen } from "../state/featureState.js";
import { attributesSupportLayerCapability } from "../config/layerDefinitions.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createActionButton, updateActionButton } from "./popupActionDom.js";
import { closePopupActionDropdown } from "./popupActionDropdown.js";

const ACTION_ROW_CLASS = "popup-action-bar__row";

export function createPopupActionBar({ attributes, refreshAndRender } = {}) {
  if (!attributesSupportLayerCapability(attributes, "supportsProductActions")) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");

  updatePopupActionBar(container, {
    attributes,
    refreshAndRender,
    force: true,
  });

  return container;
}

export function updatePopupActionBar(
  container,
  { attributes, refreshAndRender, force = false } = {}
) {
  if (!container) {
    return {
      supported: false,
      changed: false,
    };
  }

  if (!attributesSupportLayerCapability(attributes, "supportsProductActions")) {
    closeOpenDropdownIn(container);

    return {
      supported: false,
      changed: container.childElementCount > 0,
    };
  }

  const frozen = isStatusFrozen(attributes?.status);
  const actionGroups = createPopupActionGroups({
    attributes,
    frozen,
    refreshAndRender,
  });
  const changed = reconcileActionRows(container, actionGroups, {
    force,
  });

  return {
    supported: true,
    changed,
  };
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
