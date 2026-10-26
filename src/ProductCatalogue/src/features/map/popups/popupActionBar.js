import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createActionButton, updateActionButton, disposeActionButton } from "./popupActionDom.js";
import { closePopupActionDropdown } from "./popupActionDropdown.js";

const ACTION_ROW_CLASS = "popup-action-bar__row";

export function createPopupActionBar({
  attributes,
  graphic,
  productContext,
  refreshAndRender,
  packageActions,
} = {}) {
  const context = productContext ?? resolveProductContext({ graphic, attributes });
  const actionGroups = getActionGroups({
    context,
    graphic,
    attributes,
    refreshAndRender,
    packageActions,
  });

  if (actionGroups.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");
  reconcileActionRows(container, actionGroups, { force: true });
  container.classList.add("popup-action-bar--unified");

  return container;
}

export function updatePopupActionBar(
  container,
  { attributes, graphic, productContext, refreshAndRender, packageActions, force = false } = {}
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
    packageActions,
  });

  if (actionGroups.length === 0) {
    const changed = container.childElementCount > 0;
    closeOpenDropdownIn(container);
    disposeActionsIn(container);
    container.replaceChildren();

    return {
      supported: false,
      changed,
    };
  }

  const changed = reconcileActionRows(container, actionGroups, { force });
  container.classList.add("popup-action-bar--unified");

  return {
    supported: true,
    changed,
  };
}

function getActionGroups({ context, graphic, attributes, refreshAndRender, packageActions }) {
  if (!context) {
    return [];
  }

  const resolvedAttributes = attributes ?? graphic?.attributes ?? context.graphic?.attributes ?? {};
  return createPopupActionGroups({
    attributes: resolvedAttributes,
    graphic,
    productContext: context,
    refreshAndRender,
    packageActions,
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

    if (reconcileWorkflowActionButtons(row, actions, { force })) {
      changed = true;
    }
  }

  for (let rowIndex = actionGroups.length; rowIndex < rows.length; rowIndex += 1) {
    closeOpenDropdownIn(rows[rowIndex]);
    disposeActionsIn(rows[rowIndex]);
    rows[rowIndex].remove();
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

function reconcileWorkflowActionButtons(row, actions, { force }) {
  let changed = false;
  const existing = new Map(
    Array.from(row.children).map((action) => [action.dataset.popupActionId, action])
  );
  for (const [index, config] of actions.entries()) {
    let action = existing.get(config.id);
    if (action) {
      existing.delete(config.id);
      changed = updateActionButton(action, config, { force }) || changed;
    } else {
      action = createActionButton(config);
      changed = true;
    }
    if (row.children[index] !== action) {
      row.insertBefore(action, row.children[index] ?? null);
      changed = true;
    }
  }
  for (const action of existing.values()) {
    closeOpenDropdownForAction(action);
    disposeActionButton(action);
    action.remove();
    changed = true;
  }
  return changed;
}

function disposeActionsIn(container) {
  for (const action of container.querySelectorAll(".popup-action-bar__action")) {
    disposeActionButton(action);
  }
}
