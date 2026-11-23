import { UNKNOWN_WORKSPACE_COLOR, WORKSPACE_JOB_COLOR_LEVELS } from "./workspaceJobColors.js";

// The map and the legend share the same count thresholds and RGB values.
// This is a passive explanation of Work Scope, never a second visibility control.
export function createWorkspaceColorLegend() {
  const legend = document.createElement("section");
  legend.className = "dc-workspace-color-legend";
  legend.setAttribute("aria-label", "Workspace color legend");

  const title = document.createElement("h3");
  title.className = "dc-workspace-color-legend__title";
  title.textContent = "Workspace colors";
  const description = document.createElement("p");
  description.className = "dc-workspace-color-legend__description";
  description.textContent = "Open Packages per Workspace";
  const list = document.createElement("ul");
  list.className = "dc-workspace-color-legend__levels";

  for (const item of [
    ...WORKSPACE_JOB_COLOR_LEVELS.map(({ label, rgb }) => ({ label, rgb })),
    { label: "Loading / unknown", rgb: UNKNOWN_WORKSPACE_COLOR },
  ]) {
    const entry = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "dc-workspace-color-legend__swatch";
    swatch.style.backgroundColor = `rgb(${item.rgb.join(", ")})`;
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = item.label;
    entry.append(swatch, label);
    list.append(entry);
  }

  legend.append(title, description, list);
  return legend;
}
