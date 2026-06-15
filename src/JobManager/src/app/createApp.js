import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import {
  showInfoNotice,
  showSuccessNotice,
} from "../features/notices/services/noticeService.js";

export function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const noticeRegion = createNoticeRegion();

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";

  shellElement.appendChild(createHeader());
  shellElement.appendChild(createMapWorkspace(runtimeConfig));
  shellElement.appendChild(noticeRegion);

  rootElement.replaceChildren(shellElement);

  return {
    destroy() {
      noticeRegion.destroy?.();
      rootElement.replaceChildren();
    },
  };
}

function createHeader() {
  const headerElement = document.createElement("header");
  headerElement.className = "job-manager-navbar";

  const brandElement = document.createElement("div");
  brandElement.className = "job-manager-navbar__brand";

  const logoElement = document.createElement("div");
  logoElement.className = "job-manager-navbar__logo";
  logoElement.setAttribute("aria-label", "GST");
  logoElement.textContent = "GST";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "job-manager-navbar__title-group";

  const titleElement = document.createElement("h1");
  titleElement.className = "job-manager-navbar__title";
  titleElement.textContent = "Job Manager";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "job-manager-navbar__subtitle";
  subtitleElement.textContent = "Areas of Interest and Jobs";

  titleGroupElement.append(titleElement, subtitleElement);
  brandElement.append(logoElement, titleGroupElement);

  const actionsElement = document.createElement("div");
  actionsElement.className = "job-manager-navbar__actions";

  const jobsButton = document.createElement("button");
  jobsButton.type = "button";
  jobsButton.className = "btn btn-sm btn-primary";
  jobsButton.textContent = "Jobs";

  jobsButton.addEventListener("click", () => {
    showInfoNotice({
      title: "Jobs panel",
      message: "The Jobs panel is already visible in the map workspace.",
    });
  });

  const noticeTestButton = document.createElement("button");
  noticeTestButton.type = "button";
  noticeTestButton.className = "btn btn-sm btn-outline-light";
  noticeTestButton.textContent = "Test notice";

  // This temporary action validates the notice pipeline before real Job mutations exist.
  noticeTestButton.addEventListener("click", () => {
    showSuccessNotice({
      title: "Notice pipeline ready",
      message: "User-facing notices can now be triggered from services.",
    });
  });

  const updatedElement = document.createElement("span");
  updatedElement.className = "job-manager-navbar__meta";
  updatedElement.textContent = "Updated: -";

  actionsElement.append(jobsButton, noticeTestButton, updatedElement);
  headerElement.append(brandElement, actionsElement);

  return headerElement;
}

function createMapWorkspace(runtimeConfig) {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "job-manager-workspace";

  const mapElement = createMapPlaceholder(runtimeConfig);
  const overlayElement = createJobsOverlay();

  workspaceElement.append(mapElement, overlayElement);

  return workspaceElement;
}

function createMapPlaceholder(runtimeConfig) {
  const mapElement = document.createElement("section");
  mapElement.className = "job-manager-map";
  mapElement.setAttribute("aria-labelledby", "job-manager-map-title");

  const contentElement = document.createElement("div");
  contentElement.className = "job-manager-map__placeholder";

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-map-title";
  titleElement.className = "job-manager-map__title";
  titleElement.textContent = "Map";

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "job-manager-map__description";
  descriptionElement.textContent =
    "The ArcGIS map will fill this workspace and show Areas of Interest.";

  const configStatusElement = document.createElement("p");
  configStatusElement.className = "job-manager-map__meta";

  configStatusElement.textContent = runtimeConfig.aoiFeatureServiceUrl
    ? "AOI Feature Service configuration found."
    : "AOI Feature Service configuration is not set yet.";

  contentElement.append(titleElement, descriptionElement, configStatusElement);
  mapElement.appendChild(contentElement);

  return mapElement;
}

function createJobsOverlay() {
  const panelElement = document.createElement("aside");
  panelElement.className = "job-manager-overlay-panel job-manager-jobs-overlay";
  panelElement.setAttribute("aria-labelledby", "job-manager-jobs-title");

  const headerElement = document.createElement("div");
  headerElement.className = "job-manager-overlay-panel__header";

  const titleGroupElement = document.createElement("div");

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-jobs-title";
  titleElement.className = "job-manager-overlay-panel__title";
  titleElement.textContent = "Jobs";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "job-manager-overlay-panel__subtitle";
  subtitleElement.textContent = "Initial workspace panel";

  titleGroupElement.append(titleElement, subtitleElement);

  const statusBadgeElement = document.createElement("span");
  statusBadgeElement.className = "job-manager-status-badge";
  statusBadgeElement.textContent = "Mock";

  headerElement.append(titleGroupElement, statusBadgeElement);

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "job-manager-overlay-panel__description";
  descriptionElement.textContent =
    "This panel will show the Job list, quick filters and selected Job details while the map remains the primary workspace.";

  const quickActionsElement = document.createElement("div");
  quickActionsElement.className = "job-manager-quick-actions";

  for (const label of ["AOIs with Jobs", "Active Jobs", "High Priority"]) {
    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.className = "btn btn-sm btn-outline-secondary";
    buttonElement.textContent = label;

    buttonElement.addEventListener("click", () => {
      showInfoNotice({
        title: "Quick filter placeholder",
        message: `${label} will be connected after Job and AOI state exists.`,
      });
    });

    quickActionsElement.appendChild(buttonElement);
  }

  const placeholderListElement = document.createElement("ul");
  placeholderListElement.className = "job-manager-overlay-list";

  for (const item of [
    "Mock Job service",
    "Job list",
    "Status mutations",
    "AOI relation summary",
  ]) {
    const itemElement = document.createElement("li");
    itemElement.textContent = item;
    placeholderListElement.appendChild(itemElement);
  }

  panelElement.append(
    headerElement,
    descriptionElement,
    quickActionsElement,
    placeholderListElement,
  );

  return panelElement;
}
