import { getStatusColor, getStatusIdByName } from "../../features/data/stores/statusStore.js";

/**
 * ProductState colors must never be applied to aggregate ENC Package statuses.
 * Callers use this only for source-verified Product or package-member status.
 */
export function applyProductStatusTone(element, status, { errorMessage = null } = {}) {
  const palette = getStatusColor(status) ?? getStatusColor(getStatusIdByName(status));
  if (palette) {
    element.classList.add("pc-status-chip--colored");
    element.style?.setProperty("--pc-status-chip-background", palette.header);
    element.style?.setProperty("--pc-status-chip-border", palette.outline);
  }
  if (errorMessage) {
    // Keep the visible status short; expose the backend message on hover and to AT.
    element.title = String(errorMessage);
    element.setAttribute("aria-label", `${element.textContent}: ${errorMessage}`);
  }
}
