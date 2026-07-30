import { closePopupActionDropdown, togglePopupActionDropdown } from "./popupActionDropdown.js";
import { bindVisibleFocusState } from "../../../shared/ui/focus/visibleFocus.js";
import { createActionConfigSignature } from "./popupActionConfigSignature.js";

const actionStates = new WeakMap();

export function createActionButton(actionConfig) {
  const action = document.createElement("calcite-action");
  const state = {
    config: actionConfig,
    signature: null,
    localBusy: false,
    configuredClassNames: [],
  };

  actionStates.set(action, state);
  bindVisibleFocusState(action);

  action.addEventListener("keydown", (event) => {
    const currentConfig = state.config;
    const hasDropdown = hasActionDropdown(currentConfig);

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
      items: currentConfig.items,
      focusFirstItem: true,
      restoreFocusOnClose: true,
    });
  });

  action.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const currentConfig = state.config;
    const hasDropdown = hasActionDropdown(currentConfig);

    if (action.disabled || action.dataset.busy === "true") {
      return;
    }

    if (hasDropdown) {
      const focusFirstItem = event.detail === 0;

      togglePopupActionDropdown({
        anchorElement: action,
        items: currentConfig.items,
        focusFirstItem,
        restoreFocusOnClose: focusFirstItem,
      });
      return;
    }

    closePopupActionDropdown();

    await runActionWithBusyState(action, state, async () => {
      await state.config.onClick?.({
        anchorElement: action,
      });
    });
  });

  updateActionButton(action, actionConfig, {
    force: true,
  });

  return action;
}

export function updateActionButton(action, actionConfig, { force = false } = {}) {
  const state = actionStates.get(action);

  if (!state) {
    throw new Error("Popup action button was not created by createActionButton().");
  }

  const nextSignature = createActionConfigSignature(actionConfig);
  const changed = force || state.signature !== nextSignature;
  const openDropdownState = changed ? captureOpenDropdownState(action) : null;

  state.config = actionConfig;
  state.signature = nextSignature;

  if (changed) {
    applyActionConfig(action, state);
    refreshOpenDropdown(action, actionConfig, openDropdownState);
  }

  return changed;
}

function applyActionConfig(action, state) {
  const actionConfig = state.config;
  const hasDropdown = hasActionDropdown(actionConfig);
  const showsLoading = Boolean(actionConfig.loading);
  const blocksClickWhileLoading = showsLoading && !hasDropdown;
  const disabled = Boolean(actionConfig.disabled) || state.localBusy;
  const busy = state.localBusy || blocksClickWhileLoading;
  const title = actionConfig.disabledReason ?? actionConfig.label;

  action.icon = actionConfig.icon;
  action.text = actionConfig.label;
  action.title = title;
  action.scale = "m";
  action.appearance = "transparent";
  action.disabled = disabled;
  action.loading = showsLoading;
  action.textEnabled = true;
  applyConfiguredClasses(action, state, [
    "popup-action-bar__action",
    ...splitClassNames(actionConfig.className),
  ]);
  action.dataset.popupActionId = actionConfig.id;
  action.dataset.onboardingTarget = "popup-actions";
  action.dataset.busy = String(Boolean(busy));

  action.setAttribute("text", actionConfig.label);
  action.setAttribute("title", title);
  action.setAttribute("text-enabled", "");
  action.toggleAttribute("disabled", disabled);
  setBooleanAriaAttribute(action, "aria-disabled", disabled);
  action.toggleAttribute("loading", showsLoading);
  setBooleanAriaAttribute(action, "aria-busy", showsLoading || state.localBusy);

  if (hasDropdown) {
    action.setAttribute("aria-haspopup", "menu");

    if (!action.hasAttribute("aria-expanded")) {
      action.setAttribute("aria-expanded", "false");
    }
  } else {
    action.removeAttribute("aria-haspopup");
    action.removeAttribute("aria-expanded");
  }
}

async function runActionWithBusyState(action, state, runAction) {
  state.localBusy = true;
  applyActionConfig(action, state);

  try {
    await runAction();
  } finally {
    state.localBusy = false;
    applyActionConfig(action, state);
  }
}

function applyConfiguredClasses(action, state, classNames) {
  for (const className of state.configuredClassNames) {
    action.classList.remove(className);
  }

  for (const className of classNames) {
    action.classList.add(className);
  }

  state.configuredClassNames = classNames;
}

function splitClassNames(value) {
  return String(value ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

function setBooleanAriaAttribute(element, name, enabled) {
  if (enabled) {
    element.setAttribute(name, "true");
    return;
  }

  element.removeAttribute(name);
}

function hasActionDropdown(actionConfig) {
  return Array.isArray(actionConfig?.items) && actionConfig.items.length > 0;
}

function captureOpenDropdownState(action) {
  if (action.getAttribute("aria-expanded") !== "true") {
    return null;
  }

  const dropdownId = action.getAttribute("aria-controls");
  const dropdown = dropdownId ? document.getElementById(dropdownId) : null;
  const activeElement = document.activeElement;
  const focusedActionId = dropdown?.contains(activeElement)
    ? (activeElement?.dataset?.dropdownActionId ?? null)
    : null;

  return {
    focusedActionId,
    hadDropdownFocus: Boolean(dropdown?.contains(activeElement)),
  };
}

function refreshOpenDropdown(action, actionConfig, openDropdownState) {
  if (!openDropdownState) {
    return;
  }

  closePopupActionDropdown();

  if (!hasActionDropdown(actionConfig)) {
    return;
  }

  togglePopupActionDropdown({
    anchorElement: action,
    items: actionConfig.items,
    focusFirstItem: false,
    restoreFocusOnClose: openDropdownState.hadDropdownFocus,
  });

  if (!openDropdownState.hadDropdownFocus) {
    return;
  }

  requestAnimationFrame(() => {
    restoreDropdownFocus(action, openDropdownState.focusedActionId);
  });
}

function restoreDropdownFocus(action, focusedActionId) {
  const dropdownId = action.getAttribute("aria-controls");
  const dropdown = dropdownId ? document.getElementById(dropdownId) : null;

  if (!dropdown) {
    return;
  }

  const items = Array.from(dropdown.querySelectorAll("[data-dropdown-action-id]"));
  const preferredItem = focusedActionId
    ? items.find((item) => item.dataset.dropdownActionId === focusedActionId)
    : null;
  const target = isEnabledDropdownItem(preferredItem)
    ? preferredItem
    : items.find(isEnabledDropdownItem);

  target?.focus?.();
}

function isEnabledDropdownItem(item) {
  return Boolean(item) && !item.disabled && item.dataset.busy !== "true";
}
