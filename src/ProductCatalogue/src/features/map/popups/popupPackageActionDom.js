import { bindVisibleFocusState } from "../../../shared/ui/focus/visibleFocus.js";
import { createActionConfigSignature } from "./popupActionConfigSignature.js";

const states = new WeakMap();
let nextHelpId = 0;

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
    hovered: false,
    focused: false,
    helpHovered: false,
    dismissed: false,
    help: null,
    helpId: `popup-package-action-help-${++nextHelpId}`,
    unbindFocus: bindVisibleFocusState(button),
  };
  states.set(button, state);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  button.addEventListener("pointerenter", () => {
    state.hovered = true;
    state.dismissed = false;
    showHelp(button, state);
  });
  button.addEventListener("pointerleave", (event) => {
    state.hovered = false;
    if (!state.focused && !state.help?.contains(event.relatedTarget)) hideHelp(button, state);
  });
  button.addEventListener("focus", () => {
    state.focused = true;
    state.dismissed = false;
    showHelp(button, state);
  });
  button.addEventListener("blur", () => {
    state.focused = false;
    if (!state.hovered && !state.helpHovered) hideHelp(button, state);
  });
  state.onEscape = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    state.dismissed = true;
    hideHelp(button, state);
  };
  state.onViewportChange = () => hideHelp(button, state);
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
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-description", config.disabledReason);
    button.removeAttribute("title");
    // Native disabled would remove the keyboard path to the explanation.
    button.disabled = false;
    button.tabIndex = 0;
    button.dataset.popupActionId = config.id;
    button.dataset.onboardingTarget = "popup-actions";
    button.dataset.busy = "false";
    state.icon.icon = config.icon;
    if (state.help) state.help.textContent = getHelpText(config);
  }
  if (!isCurrent(button, state)) hideHelp(button, state);
  return changed;
}

export function disposeUnavailablePackageAction(button) {
  const state = states.get(button);
  if (!state || state.disposed) return;
  state.disposed = true;
  hideHelp(button, state);
  state.unbindFocus();
}

function isCurrent(button, state) {
  return !state.disposed && button.isConnected && state.config.isCurrent?.() !== false;
}

function getHelpText(config) {
  return `${config.label}. ${config.disabledReason}`;
}

function showHelp(button, state) {
  if (!isCurrent(button, state) || state.dismissed || state.help) return;
  const help = document.createElement("div");
  help.id = state.helpId;
  help.className = "popup-package-action-help";
  help.setAttribute("role", "tooltip");
  help.textContent = getHelpText(state.config);
  state.help = help;
  button.setAttribute("aria-describedby", help.id);
  help.addEventListener("pointerenter", () => {
    state.helpHovered = true;
  });
  help.addEventListener("pointerleave", (event) => {
    state.helpHovered = false;
    if (!state.focused && !button.contains(event.relatedTarget)) hideHelp(button, state);
  });
  document.body.appendChild(help);
  positionHelp(button, help);
  document.addEventListener("keydown", state.onEscape, true);
  document.addEventListener("scroll", state.onViewportChange, true);
  window.addEventListener("resize", state.onViewportChange);
}

function hideHelp(button, state) {
  state.help?.remove();
  state.help = null;
  state.helpHovered = false;
  button.removeAttribute("aria-describedby");
  document.removeEventListener("keydown", state.onEscape, true);
  document.removeEventListener("scroll", state.onViewportChange, true);
  window.removeEventListener("resize", state.onViewportChange);
}

function positionHelp(button, help) {
  const rect = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - help.offsetWidth - 8));
  const below = rect.bottom + help.offsetHeight <= window.innerHeight - 8;
  // No gap between anchor and tooltip, so pointer users can enter the help text.
  const top = below ? rect.bottom : Math.max(8, rect.top - help.offsetHeight);
  help.style.left = `${left}px`;
  help.style.top = `${top}px`;
}
