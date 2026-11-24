// The native ArcGIS Popup owns the Workspace title and close button, as in
// ProductCatalogue. Only the action row and read-only facts belong to content.
export function createWorkspacePopupTemplate() {
  return {
    title({ graphic } = {}) {
      return escapeHtml(
        displayName(
          graphic?.attributes?.workspaceName,
          graphic?.attributes?.workspaceId,
          "Workspace"
        )
      );
    },
    content({ graphic } = {}) {
      const attributes = graphic?.attributes ?? {};
      const pipeline = displayName(attributes.pipelineName, attributes.pipelineId, "Unavailable");
      const openJobs = validOpenCount(attributes.openJobs);
      const content = element("div", "dc-workspace-popup");
      content.setAttribute("aria-label", "Workspace details");

      const actions = element("div", "dc-workspace-popup__actions");
      actions.setAttribute("role", "group");
      actions.setAttribute("aria-label", "Workspace actions");
      const take = element("button", "dc-workspace-popup__take");
      take.type = "button";
      take.disabled = true;
      take.title = "Workspace locking is not connected to the backend";
      take.setAttribute("aria-label", "Take workspace (not available)");
      take.append(icon("hammer-lock"), text("span", "Take workspace"));
      actions.append(take);

      const owner = element("div", "dc-workspace-popup__lock-owner");
      owner.setAttribute("aria-label", "Lock status placeholder: None");
      owner.title = "Lock state is not yet available from the backend";
      owner.append(icon("unlock"), text("span", "None"));
      actions.append(owner);
      content.append(actions);

      const information = element("section", "dc-workspace-popup__information");
      information.setAttribute("aria-label", "Workspace information");
      const heading = element("h3", "dc-workspace-popup__section-title");
      heading.textContent = "Information";
      information.append(heading);
      const details = element("dl", "dc-workspace-popup__details");
      appendDetail(details, "Workstream", pipeline);
      if (openJobs !== null) appendDetail(details, "Open packages", String(openJobs));
      information.append(details);
      content.append(information);
      return content;
    },
    actions: [],
    overwriteActions: true,
  };
}

function element(tagName, className) {
  const node = document.createElement(tagName);
  node.className = className;
  return node;
}

function text(tagName, value) {
  const node = document.createElement(tagName);
  node.textContent = value;
  return node;
}

function icon(name) {
  const node = document.createElement("calcite-icon");
  node.setAttribute("icon", name);
  node.setAttribute("scale", "s");
  node.setAttribute("aria-hidden", "true");
  return node;
}

function appendDetail(details, label, value) {
  const row = element("div", "dc-workspace-popup__detail");
  row.append(text("dt", label), text("dd", value));
  details.append(row);
}

function validOpenCount(count) {
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function displayName(primary, fallback, defaultValue) {
  for (const candidate of [primary, fallback]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return defaultValue;
}

// PopupTemplate titles are HTML formatted by the SDK; do not trust API labels.
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
