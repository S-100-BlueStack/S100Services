import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import {
  showInfoNotice,
  showSuccessNotice,
} from "../features/notices/services/noticeService.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const noticeRegion = createNoticeRegion();

  const header = await createHeader();
  const jobsPanel = createJobsOverlay();
  const workspaceElement = createMapWorkspace(runtimeConfig);

  workspaceElement.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";
  shellElement.append(header.element, workspaceElement, noticeRegion);

  rootElement.replaceChildren(shellElement);

  setPanelOpen(jobsPanel.element, header.jobsButton, true);

  header.jobsButton.addEventListener("click", () => {
    togglePanel(jobsPanel.element, header.jobsButton);
  });

  jobsPanel.closeButton.addEventListener("click", () => {
    setPanelOpen(jobsPanel.element, header.jobsButton, false);
  });

  header.testNoticeButton.addEventListener("click", () => {
    showSuccessNotice({
      title: "Notice pipeline ready",
      message: "User-facing notices can now be triggered from services.",
    });
  });

  for (const filterItem of header.filterItems) {
    filterItem.addEventListener("click", () => {
      const filterLabel = filterItem.dataset.filterPlaceholder;

      showInfoNotice({
        title: "Filter placeholder",
        message: `${filterLabel} will be connected after shared filter state exists.`,
      });
    });
  }

  return {
    destroy() {
      noticeRegion.destroy?.();
      rootElement.replaceChildren();
    },
  };
}

async function createHeader() {
  const headerElement = await loadNavbarTemplate();

  const jobsButton = getRequiredElement(headerElement, "#jobs-toggle");
  const testNoticeButton = getRequiredElement(
    headerElement,
    "#test-notice-button",
  );
  const filterItems = [
    ...headerElement.querySelectorAll("[data-filter-placeholder]"),
  ];

  return {
    element: headerElement,
    jobsButton,
    testNoticeButton,
    filterItems,
  };
}

async function loadNavbarTemplate() {
  const response = await fetch("/components/navbar.html", {
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(
      `Job Manager could not load the navbar template. Status: ${response.status}`,
    );
  }

  const template = document.createElement("template");
  template.innerHTML = await response.text();

  const headerElement = template.content.firstElementChild;

  if (!headerElement) {
    throw new Error(
      "Job Manager navbar template did not contain a root element.",
    );
  }

  return headerElement;
}

function createMapWorkspace(runtimeConfig) {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "job-manager-workspace";

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
  workspaceElement.appendChild(mapElement);

  return workspaceElement;
}

function createJobsOverlay() {
  const panelElement = document.createElement("aside");
  panelElement.id = "job-manager-jobs-panel";
  panelElement.className = "job-manager-overlay-panel job-manager-jobs-overlay";
  panelElement.setAttribute("aria-labelledby", "job-manager-jobs-title");

  const headerElement = document.createElement("div");
  headerElement.className = "job-manager-overlay-panel__header";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "job-manager-overlay-panel__title-group";

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-jobs-title";
  titleElement.className = "job-manager-overlay-panel__title";
  titleElement.textContent = "Jobs";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "job-manager-overlay-panel__subtitle";
  subtitleElement.textContent = "Initial workspace panel";

  titleGroupElement.append(titleElement, subtitleElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "job-manager-overlay-panel__close";
  closeButton.setAttribute("aria-label", "Close Jobs panel");
  closeButton.textContent = "×";

  headerElement.append(titleGroupElement, closeButton);

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "job-manager-overlay-panel__description";
  descriptionElement.textContent =
    "This panel will show the Job list, selected Job details and related AOIs while the map remains the primary workspace.";

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
    placeholderListElement,
  );

  return {
    element: panelElement,
    closeButton,
  };
}

function getRequiredElement(rootElement, selector) {
  const element = rootElement.querySelector(selector);

  if (!element) {
    throw new Error(`Expected navbar element was not found: ${selector}`);
  }

  return element;
}

function togglePanel(panelElement, triggerButton) {
  setPanelOpen(panelElement, triggerButton, panelElement.hidden);
}

function setPanelOpen(panelElement, triggerButton, isOpen) {
  panelElement.hidden = !isOpen;
  panelElement.setAttribute("aria-hidden", String(!isOpen));
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}
