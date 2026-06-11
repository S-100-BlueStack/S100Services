import { closePopupActionDropdown, togglePopupActionDropdown } from "./popupActionDropdown.js";
import { bindVisibleFocusState } from "../../../shared/ui/focus/visibleFocus.js";

export function createActionButton(actionConfig) {
  const action = document.createElement("calcite-action");
  const hasDropdown = Array.isArray(actionConfig.items) && actionConfig.items.length > 0;
  const showsLoading = Boolean(actionConfig.loading);
  const blocksClickWhileLoading = showsLoading && !hasDropdown;

  action.icon = actionConfig.icon;
  action.text = actionConfig.label;
  action.title = actionConfig.disabledReason ?? actionConfig.label;
  action.scale = "m";
  action.appearance = "transparent";
  action.disabled = Boolean(actionConfig.disabled);
  action.loading = showsLoading;
  action.textEnabled = true;
  action.className = ["popup-action-bar__action", actionConfig.className].filter(Boolean).join(" ");
  action.dataset.popupActionId = actionConfig.id;

  bindVisibleFocusState(action);

  if (hasDropdown) {
    action.setAttribute("aria-haspopup", "menu");
    action.setAttribute("aria-expanded", "false");
  }

  // Calcite upgrades custom elements asynchronously, so set attributes as well
  // as properties to keep first render and upgraded render aligned.
  action.setAttribute("text", actionConfig.label);
  action.setAttribute("title", actionConfig.disabledReason ?? actionConfig.label);
  action.setAttribute("text-enabled", "");

  if (actionConfig.disabled) {
    action.setAttribute("disabled", "");
    action.setAttribute("aria-disabled", "true");
  }

  if (showsLoading) {
    action.setAttribute("loading", "");
    action.setAttribute("aria-busy", "true");
  }

  if (blocksClickWhileLoading) {
    action.dataset.busy = "true";
  }

  action.addEventListener("keydown", (event) => {
    if (!hasDropdown || event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action.disabled || action.dataset.busy === "true") {
      return;
    }

    togglePopupActionDropdown({
      anchorElement: action,
      items: actionConfig.items,
      focusFirstItem: true,
      restoreFocusOnClose: true,
    });
  });

  action.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (action.disabled || action.dataset.busy === "true") {
      return;
    }

    if (hasDropdown) {
      const focusFirstItem = event.detail === 0;

      togglePopupActionDropdown({
        anchorElement: action,
        items: actionConfig.items,
        focusFirstItem,
        restoreFocusOnClose: focusFirstItem,
      });
      return;
    }

    closePopupActionDropdown();

    await runActionWithBusyState(action, async () => {
      await actionConfig.onClick?.({
        anchorElement: action,
      });
    });
  });

  return action;
}

async function runActionWithBusyState(action, runAction) {
  const wasDisabled = Boolean(action.disabled);

  setActionBusy(action, true);

  try {
    await runAction();
  } finally {
    setActionBusy(action, false, {
      disabled: wasDisabled,
    });
  }
}

function setActionBusy(action, busy, { disabled = true } = {}) {
  action.dataset.busy = String(Boolean(busy));
  action.toggleAttribute("aria-busy", Boolean(busy));

  if (busy || disabled) {
    action.disabled = true;
    action.setAttribute("disabled", "");
    action.setAttribute("aria-disabled", "true");
    return;
  }

  action.disabled = false;
  action.removeAttribute("disabled");
  action.removeAttribute("aria-disabled");
}
