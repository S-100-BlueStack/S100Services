import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

export function applyPopupProductStatusCell(cell, status, { resolveStatusId = () => null } = {}) {
  const palette = statusColorConfig[status] ?? statusColorConfig[resolveStatusId(status)];
  if (!palette) return;
  cell.classList.add("popup-product-table__status");
  cell.style.setProperty("--pc-product-status-background", palette.header);
}
