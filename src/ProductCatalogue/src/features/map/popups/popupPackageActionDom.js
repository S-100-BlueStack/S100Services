import { bindVisibleFocusState } from "../../../shared/ui/focus/visibleFocus.js";
import { createActionConfigSignature } from "./popupActionConfigSignature.js";
import { bindPopupActionHelp } from "./popupActionHelp.js";
import { getPopupActionHelpText } from "./popupActionHelpText.js";

const states = new WeakMap();

/** A focusable unavailable control has no dispatcher, even if a caller supplies one. */
export function createUnavailablePackageAction(config) {
  const button = document.createElement("button");
  button.type = "button";
  const icon = document.createElement("calcite-icon");
  icon.scale = "m";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);
  const state = {
    config,
    icon,
    signature: null,
    configuredClasses: [],
    disposed: false,
    localBusy: false,
    help: bindPopupActionHelp(button),
    unbindFocus: bindVisibleFocusState(button),
  };
  states.set(button, state);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      state.config.controlKind !== "live-package" ||
      state.config.disabled ||
      state.localBusy ||
      !isCurrent(button, state)
    )
      return;
    state.localBusy = true;
    updateUnavailablePackageAction(button, state.config, { force: true });
    try {
      await state.config.onClick?.({ anchorElement: button });
    } finally {
      state.localBusy = false;
      updateUnavailablePackageAction(button, state.config, { force: true });
    }
  });
  button.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      // Native button activation handles Enter and Space; do not cancel it for live actions.
      if (state.config.controlKind !== "live-package" || state.config.disabled)
        event.preventDefault();
      event.stopPropagation();
    }
  });
  updateUnavailablePackageAction(button, config, { force: true });
  return button;
}

export function isUnavailablePackageAction(button) {
  return states.has(button);
}

export function updateUnavailablePackageAction(button, config, { force = false } = {}) {
  const state = states.get(button);
  if (!state || state.disposed) return false;
  const signature = createActionConfigSignature(config);
  // Reused controls must lose native help even when their presentation is unchanged.
  const changed = force || signature !== state.signature || button.hasAttribute("title");
  state.config = config;
  state.signature = signature;
  if (changed) {
    for (const name of state.configuredClasses) button.classList.remove(name);
    state.configuredClasses = [
      "popup-action-bar__action",
      ...(config.className ?? "").split(/\s+/).filter(Boolean),
    ];
    for (const name of state.configuredClasses) button.classList.add(name);
    button.setAttribute("aria-label", config.label);
    const disabled = config.controlKind !== "live-package" || config.disabled || state.localBusy;
    button.setAttribute("aria-disabled", String(disabled));
    button.setAttribute(
      "aria-description",
      config.disabledReason ?? config.helpText ?? config.label
    );
    button.removeAttribute("title");
    // Native disabled would remove the keyboard path to the explanation.
    button.disabled = false;
    button.tabIndex = 0;
    button.dataset.popupActionId = config.id;
    button.dataset.onboardingTarget = "popup-actions";
    button.dataset.busy = String(state.localBusy);
    state.icon.icon = config.icon;
    state.help.update(getPopupActionHelpText(config));
  }
  if (!isCurrent(button, state)) state.help.hide();
  return changed;
}

export function disposeUnavailablePackageAction(button) {
  const state = states.get(button);
  if (!state || state.disposed) return;
  state.disposed = true;
  state.help.destroy();
  state.unbindFocus();
}

function isCurrent(button, state) {
  return !state.disposed && button.isConnected && state.config.isCurrent?.() !== false;
}
