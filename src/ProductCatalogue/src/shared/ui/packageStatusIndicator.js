import {
  getEncPackageStatusLabel,
  normalizeEncPackageStatus,
} from "../../features/dataSources/domain/encPackageStatus.js";
import { packageStatusColorConfig } from "../config/colorsConfig.js";

export function createPackageStatusIndicator(value) {
  const status = normalizeEncPackageStatus(value);
  const indicator = document.createElement("span");
  indicator.className = "pc-package-status-indicator";
  indicator.textContent = `Package status: ${getEncPackageStatusLabel(status)}`;
  const palette = packageStatusColorConfig[status];
  if (palette) {
    indicator.style.setProperty("--pc-package-indicator-background", palette.badge);
    indicator.style.setProperty("--pc-package-indicator-border", palette.outline);
  }
  return indicator;
}
