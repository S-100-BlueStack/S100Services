import { bindHelpTooltip, hideActiveHelpTooltip } from "../../../shared/ui/tooltips/helpTooltip.js";

/** Popup actions share the application's tooltip surface and keep popup Escape behavior. */
export function bindPopupActionHelp(anchor, initialText = "") {
  return bindHelpTooltip(anchor, initialText, { popup: true });
}

export function hideActivePopupActionHelp() {
  hideActiveHelpTooltip();
}
