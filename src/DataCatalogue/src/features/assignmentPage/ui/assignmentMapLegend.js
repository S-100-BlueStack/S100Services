import { ASSIGNMENT_SAVED_WORKSPACE_OUTLINE } from "../../map/workspaces/workspaceCoverageSymbol.js";

export function assignmentMapLegendMarkup(live) {
  const items = live
    ? `
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-package-aoi" aria-hidden="true"></span>Package AOI</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-package-detail" aria-hidden="true"></span>Detailed features</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-context is-saved-match" style="--dc-assignment-workspace-color: rgb(${ASSIGNMENT_SAVED_WORKSPACE_OUTLINE.rgb.join(", ")})" aria-hidden="true"></span>Current auto-matched Workspaces</span>
    `
    : `
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__feature" aria-hidden="true"></span>Selected feature</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-assigned" aria-hidden="true"></span>Assigned Work stream</span>
      <span class="dc-assignment-legend__item"><span class="dc-assignment-legend__line is-context" aria-hidden="true"></span>Unassigned context</span>
    `;

  // Native disclosure owns its open state; session redraws do not replace the node.
  return `<details class="dc-assignment-legend" aria-label="Assignment map legend" open>
    <summary class="dc-assignment-legend__summary">Map legend</summary>
    <div class="dc-assignment-legend__items">${items}</div>
  </details>`;
}
