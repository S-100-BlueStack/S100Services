import { workspaceSelectionKey } from "../workspaces/pipelineVisibility.js";

const CLAIM_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

// The native ArcGIS Popup owns the Workspace title and close button, as in
// ProductCatalogue. Only the action row and read-only facts belong to content.
export function createWorkspacePopup({ CustomContent }) {
  let alive = true;
  let summaries = new Map();
  const contentByGraphic = new Map();

  const contentFields = ["pipelineId", "workspaceId", "pipelineName", "openJobs"];
  const customContent = new CustomContent({
    outFields: contentFields,
    creator({ graphic } = {}) {
      if (!alive) return null;
      const attributes = graphic?.attributes ?? {};
      const key = workspaceSelectionKey(attributes);
      const { content, updateOwnership } = createContent(attributes);
      updateOwnership(summaries.get(key));
      if (graphic) contentByGraphic.set(graphic, { key, updateOwnership });
      return content;
    },
    destroyer({ graphic } = {}) {
      contentByGraphic.delete(graphic);
    },
  });

  const template = {
    outFields: [...contentFields, "workspaceName"],
    title({ graphic } = {}) {
      return escapeHtml(
        displayName(
          graphic?.attributes?.workspaceName,
          graphic?.attributes?.workspaceId,
          "Workspace"
        )
      );
    },
    content: [customContent],
    actions: [],
    overwriteActions: true,
  };

  return {
    template,
    setWorkspaces(workspaces) {
      if (!alive) return;
      summaries = new Map(
        workspaces.map((workspace) => [workspaceSelectionKey(workspace), workspace])
      );
      // The SDK owns when a content node is created and retired. Refresh updates
      // only the application-owned facts, without touching the selected Graphic.
      for (const { key, updateOwnership } of contentByGraphic.values()) {
        updateOwnership(summaries.get(key));
      }
    },
    destroy() {
      alive = false;
      summaries.clear();
      contentByGraphic.clear();
    },
  };
}

function createContent(attributes) {
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
  take.title = "Taking a Workspace is unavailable";
  take.setAttribute("aria-label", "Take workspace (not available)");
  take.append(icon("hammer-lock"), text("span", "Take workspace"));

  const owner = element("div", "dc-workspace-popup__lock-owner");
  owner.setAttribute("aria-live", "polite");
  const ownerLabel = element("span", "visually-hidden");
  ownerLabel.textContent = "Workspace owner: ";
  const ownerValue = text("span", "");
  owner.append(ownerLabel, ownerValue);
  actions.append(take, owner);
  content.append(actions);

  const information = element("section", "dc-workspace-popup__information");
  information.setAttribute("aria-label", "Workspace information");
  const heading = element("h3", "dc-workspace-popup__section-title");
  heading.textContent = "Information";
  const details = element("dl", "dc-workspace-popup__details");
  appendDetail(details, "Workstream", pipeline);
  if (openJobs !== null) appendDetail(details, "Open packages", String(openJobs));
  const claimTime = appendDetail(details, "Claimed at", "");
  information.append(heading, details);
  content.append(information);

  let previousOwner;
  let previousTime;
  return {
    content,
    updateOwnership({ owner, lockedAtUtc } = {}) {
      const ownerText = owner === null ? "Unassigned" : (owner ?? "Unavailable");
      if (previousOwner !== ownerText) {
        previousOwner = ownerText;
        ownerValue.textContent = ownerText;
        ownerValue.title = ownerText;
      }

      claimTime.row.hidden = typeof owner !== "string";
      const timestamp = claimTime.row.hidden ? null : (lockedAtUtc ?? null);
      if (previousTime === timestamp) return;
      previousTime = timestamp;
      if (timestamp === null) {
        claimTime.value.textContent = "Unavailable";
        return;
      }
      const localTime = CLAIM_TIME_FORMAT.format(new Date(timestamp));
      const time = text("time", localTime);
      time.dateTime = timestamp;
      time.title = `UTC: ${timestamp}`;
      const utc = element("span", "visually-hidden");
      utc.textContent = ` local time. UTC: ${timestamp}`;
      claimTime.value.replaceChildren(time, utc);
    },
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
  const description = text("dd", value);
  row.append(text("dt", label), description);
  details.append(row);
  return { row, value: description };
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
