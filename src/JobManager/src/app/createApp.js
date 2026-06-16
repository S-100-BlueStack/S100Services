import { createJobList } from "../features/jobs/ui/jobList.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { showInfoNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";

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

  await configureFiltersPopover(header);

  setPanelOpen(jobsPanel.element, header.jobsButton, true);
  setFilterPopoverOpen(header.filtersPopover, header.filtersButton, false);

  header.jobsButton.addEventListener("click", () => {
    togglePanel(jobsPanel.element, header.jobsButton);
  });

  jobsPanel.closeButton.addEventListener("click", () => {
    setPanelOpen(jobsPanel.element, header.jobsButton, false);
  });

  header.filtersButton.addEventListener("click", () => {
    setFilterPopoverOpen(header.filtersPopover, header.filtersButton, !header.filtersPopover.open);
  });

  header.filtersCloseButton.addEventListener("click", () => {
    setFilterPopoverOpen(header.filtersPopover, header.filtersButton, false);
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

  const handleDocumentClick = (event) => {
    if (!header.filtersPopover.open) {
      return;
    }

    if (isEventInsideElements(event, [header.filtersButton, header.filtersPopover])) {
      return;
    }

    setFilterPopoverOpen(header.filtersPopover, header.filtersButton, false);
  };

  document.addEventListener("click", handleDocumentClick);

  return {
    destroy() {
      document.removeEventListener("click", handleDocumentClick);
      jobsPanel.destroy();
      noticeRegion.destroy?.();
      rootElement.replaceChildren();
    },
  };
}

async function createHeader() {
  await ensureNavbarComponentsDefined();

  const headerElement = await loadNavbarTemplate();

  const jobsButton = getRequiredElement(headerElement, "#jobs-toggle");
  const filtersButton = getRequiredElement(headerElement, "#filters-button");
  const filtersPopover = getRequiredElement(headerElement, "#filters-popover");
  const filtersCloseButton = getRequiredElement(headerElement, "#filters-close-button");
  const testNoticeButton = getRequiredElement(headerElement, "#test-notice-button");
  const filterItems = [...headerElement.querySelectorAll("[data-filter-placeholder]")];

  return {
    element: headerElement,
    jobsButton,
    filtersButton,
    filtersPopover,
    filtersCloseButton,
    testNoticeButton,
    filterItems,
  };
}

async function ensureNavbarComponentsDefined() {
  await Promise.all([
    customElements.whenDefined("calcite-action"),
    customElements.whenDefined("calcite-button"),
    customElements.whenDefined("calcite-icon"),
    customElements.whenDefined("calcite-popover"),
  ]);
}

async function loadNavbarTemplate() {
  const response = await fetch("/components/navbar.html", {
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(`Job Manager could not load the navbar template. Status: ${response.status}`);
  }

  const template = document.createElement("template");
  template.innerHTML = await response.text();

  const headerElement = template.content.firstElementChild;

  if (!headerElement) {
    throw new Error("Job Manager navbar template did not contain a root element.");
  }

  return headerElement;
}

async function configureFiltersPopover({ filtersButton, filtersPopover }) {
  await filtersPopover.componentOnReady?.();

  // Use the actual element reference to avoid brittle document-wide id lookups.
  filtersPopover.referenceElement = filtersButton;
  filtersPopover.triggerDisabled = true;
  filtersPopover.overlayPositioning = "fixed";
  filtersPopover.placement = "bottom-end";
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
  const jobList = createJobList();

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
  subtitleElement.textContent = "Mock backend";

  titleGroupElement.append(titleElement, subtitleElement);

  const closeButton = document.createElement("calcite-action");
  closeButton.className = "job-manager-overlay-panel__close";
  closeButton.icon = "x";
  closeButton.text = "Close Jobs panel";
  closeButton.title = "Close Jobs panel";

  headerElement.append(titleGroupElement, closeButton);

  panelElement.append(headerElement, jobList.element);

  return {
    element: panelElement,
    closeButton,
    destroy() {
      jobList.destroy();
    },
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

function setFilterPopoverOpen(popoverElement, triggerButton, isOpen) {
  popoverElement.open = isOpen;
  popoverElement.toggleAttribute("open", isOpen);

  triggerButton.active = isOpen;
  triggerButton.toggleAttribute("active", isOpen);
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}

function isEventInsideElements(event, elements) {
  const composedPath = event.composedPath?.() ?? [];

  return elements.some(
    (element) => element.contains(event.target) || composedPath.includes(element)
  );
}
