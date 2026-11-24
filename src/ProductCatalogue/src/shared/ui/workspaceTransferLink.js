import { buildWorkspaceUrl } from "../routing/workspaceRoute.js";

const DESTINATION_LABELS = Object.freeze({ analyze: "Analyze", review: "Review" });
const LINK_SELECTOR = "a.pc-workspace-transfer";

export function createWorkspaceTransferLink({ destination, datasetNames, productId = null }) {
  if (!Object.hasOwn(DESTINATION_LABELS, destination) || !datasetNames.length) return null;

  const label = DESTINATION_LABELS[destination];
  const all = productId === null;
  const text = all ? `Open all in ${label}` : label;
  const accessibleName = all
    ? `Open all Products in ${label}`
    : `Open ${datasetNames[0]} in ${label}`;
  const url = buildWorkspaceUrl(destination, datasetNames);
  const control = document.createElement(url ? "a" : "span");
  control.className = `pc-workspace-transfer${all ? " pc-workspace-transfer--all" : ""}`;
  control.textContent = text;

  if (!url) {
    // Do not silently drop a name that cannot be represented by the public route.
    control.setAttribute("role", "link");
    control.setAttribute("aria-disabled", "true");
    control.setAttribute("aria-label", `${accessibleName} (link unavailable)`);
    control.title = "The Product list cannot be represented by a workspace link.";
    return control;
  }

  // Native links retain same-tab workspace navigation and browser modifier-click behavior.
  control.href = url;
  control.setAttribute("aria-label", accessibleName);
  control.dataset.workspaceTransferKey = all ? "all" : `product:${productId}`;
  return control;
}

export function captureWorkspaceTransferFocus(root, listSelector) {
  const activeElement = document.activeElement;
  const key = activeElement?.dataset?.workspaceTransferKey;
  if (!key || !root.contains(activeElement)) return null;
  return { key, scrollTop: root.querySelector(listSelector)?.scrollTop ?? 0 };
}

export function restoreWorkspaceTransferFocus(root, listSelector, interaction) {
  if (!interaction) return;
  // Another interaction may already have restored focus to its own control.
  if (document.activeElement !== document.body) return;
  const replacement = [...root.querySelectorAll(LINK_SELECTOR)].find(
    (control) => control.dataset.workspaceTransferKey === interaction.key
  );
  if (!replacement) return;
  const list = root.querySelector(listSelector);
  if (list) list.scrollTop = interaction.scrollTop;
  replacement.focus({ preventScroll: true });
}
