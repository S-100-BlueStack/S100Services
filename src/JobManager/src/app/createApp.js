import { createJobList } from "../features/jobs/ui/jobList.js";
import { createMapController } from "../features/map/core/mapController.js";
import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const noticeRegion = createNoticeRegion();
  const header = await createHeader();
  const jobsPanel = createJobsOverlay();
  const workspace = createMapWorkspace();
  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    onError(error) {
      showErrorNotice({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";
  shellElement.append(header.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement);

  await configureFiltersPopover(header);

  setPanelOpen(jobsPanel.element, header.jobsButton, true);
  setFilterPopoverOpen(header.filtersPopover, header.filtersButton, false);

  header.jobsButton.addEventListener("click", () => {
    const shouldOpen = jobsPanel.element.hidden;

    if (shouldOpen) {
      jobsPanel.refreshJobs();
    } else {
      jobsPanel.hideCompletedJobs();
    }

    setPanelOpen(jobsPanel.element, header.jobsButton, shouldOpen);
  });

  jobsPanel.closeButton.addEventListener("click", () => {
    jobsPanel.hideCompletedJobs();
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
  mapController.start();

  return {
    destroy() {
      document.removeEventListener("click", handleDocumentClick);
      mapController.destroy();
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
    throw new Error(`Job Manager could not load the navbar template.\nStatus: ${response.status}`);
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

function createMapWorkspace() {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "job-manager-workspace";

  const mapElement = document.createElement("section");
  mapElement.className = "job-manager-map";
  mapElement.setAttribute("aria-labelledby", "job-manager-map-title");

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-map-title";
  titleElement.className = "job-manager-map__screen-reader-title";
  titleElement.textContent = "Map";

  const mapViewElement = document.createElement("div");
  mapViewElement.className = "job-manager-map__view";

  const mapStatusElement = document.createElement("div");
  mapStatusElement.className = "job-manager-map-status";
  mapStatusElement.setAttribute("role", "status");
  mapStatusElement.setAttribute("aria-live", "polite");

  mapElement.append(titleElement, mapViewElement, mapStatusElement);
  workspaceElement.appendChild(mapElement);

  return {
    element: workspaceElement,
    mapViewElement,
    mapStatusElement,
  };
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
    refreshJobs() {
      return jobList.refreshJobs();
    },
    hideCompletedJobs() {
      jobList.hideCompletedJobs();
    },
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
