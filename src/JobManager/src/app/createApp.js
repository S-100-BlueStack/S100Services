import {
  getActiveJobFilterSummary,
  hasActiveJobFilters,
} from "../features/jobs/domain/jobFilters.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { JOB_PRIORITY_OPTIONS } from "../features/jobs/domain/jobPriority.js";
import { JOB_STATUS_OPTIONS } from "../features/jobs/domain/jobStatus.js";
import { createJobList } from "../features/jobs/ui/jobList.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const noticeRegion = createNoticeRegion();
  const header = await createHeader();
  const jobsPanel = createJobsOverlay({ jobFilterStore });
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
    onJobLayerError(error) {
      showErrorNotice({
        title: "Job geometry could not be loaded",
        message: error.message,
      });
    },
    onShowRelatedJobs(selectedAoi) {
      const normalizedSelectedAoi = selectedAoiStore.selectAoi(selectedAoi);

      if (!normalizedSelectedAoi.aoiId) {
        showErrorNotice({
          title: "AOI selection failed",
          message: "The selected AOI does not expose a usable identifier.",
        });

        return;
      }

      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      jobsPanel.showJobsForAoi(normalizedSelectedAoi);
      setPanelOpen(jobsPanel.element, header.jobsButton, true);
    },
    onShowJobDetails(selectedJob) {
      const normalizedSelectedJob = selectedJobStore.selectJob(selectedJob);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job selection failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      selectedAoiStore.clearSelection();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setPanelOpen(jobsPanel.element, header.jobsButton, true);

      void mapController.highlightJob(normalizedSelectedJob).catch((error) => {
        showErrorNotice({
          title: "Job highlight failed",
          message: error.message,
        });
      });

      if (normalizedSelectedJob.relatedAoiIds.length > 0) {
        void mapController.highlightRelatedAoisForJob(normalizedSelectedJob).catch((error) => {
          mapController.clearAoiHighlight();

          showErrorNotice({
            title: "Related AOIs could not be highlighted",
            message: error.message,
          });
        });
      } else {
        mapController.clearAoiHighlight();
      }
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";
  shellElement.append(header.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement);

  await configureFiltersPopover(header);
  configureJobFilterControls(header, jobFilterStore);

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  setPanelOpen(jobsPanel.element, header.jobsButton, true);
  setFilterPopoverOpen(header.filtersPopover, header.filtersButton, false);

  header.jobsButton.addEventListener("click", () => {
    const shouldOpen = jobsPanel.element.hidden;

    selectedJobStore.clearSelection();
    jobsPanel.clearSelectedJob();
    mapController.clearJobHighlight();
    mapController.clearAoiHighlight();

    if (shouldOpen) {
      selectedAoiStore.clearSelection();
      jobsPanel.clearAoiFilter();
      jobsPanel.refreshJobs();
    } else {
      jobsPanel.hideCompletedJobs();
    }

    setPanelOpen(jobsPanel.element, header.jobsButton, shouldOpen);
  });

  jobsPanel.closeButton.addEventListener("click", () => {
    selectedJobStore.clearSelection();
    jobsPanel.clearSelectedJob();
    mapController.clearJobHighlight();
    mapController.clearAoiHighlight();
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
      header.unsubscribeJobFilters?.();
      unsubscribeMapJobFilters?.();
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

  return {
    element: headerElement,
    jobsButton,
    filtersButton,
    filtersPopover,
    filtersCloseButton,
    testNoticeButton,
    unsubscribeJobFilters: null,
  };
}

async function ensureNavbarComponentsDefined() {
  await Promise.all([
    customElements.whenDefined("calcite-action"),
    customElements.whenDefined("calcite-button"),
    customElements.whenDefined("calcite-checkbox"),
    customElements.whenDefined("calcite-icon"),
    customElements.whenDefined("calcite-label"),
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

function configureJobFilterControls(header, jobFilterStore) {
  const filterControlRefs = createJobFilterPopoverContent({
    filtersPopover: header.filtersPopover,
    jobFilterStore,
  });

  header.filtersCloseButton = filterControlRefs.closeButton;

  header.unsubscribeJobFilters = jobFilterStore.subscribe((snapshot) => {
    syncJobFilterControls({
      filtersButton: header.filtersButton,
      filterControlRefs,
      filters: snapshot.filters,
    });
  });
}

function createJobFilterPopoverContent({ filtersPopover, jobFilterStore }) {
  const contentElement = document.createElement("div");
  contentElement.className = "job-manager-filters";

  const headerElement = document.createElement("div");
  headerElement.className = "job-manager-filters__header";

  const titleElement = document.createElement("h2");
  titleElement.className = "job-manager-filters__title";
  titleElement.textContent = "Filters";

  const closeButton = document.createElement("calcite-action");
  closeButton.id = "filters-close-button";
  closeButton.icon = "x";
  closeButton.text = "Close filters";
  closeButton.title = "Close filters";

  headerElement.append(titleElement, closeButton);

  const summaryElement = document.createElement("p");
  summaryElement.className = "job-manager-filters__summary";
  summaryElement.textContent = "No filters active";

  const quickFilterSection = createFilterSection("Quick filters");
  const activeOnlyCheckbox = createFilterCheckbox({
    label: "Active Jobs",
    onChange(checked) {
      jobFilterStore.setFilters({
        activeOnly: checked,
      });
    },
  });
  const highPriorityOnlyCheckbox = createFilterCheckbox({
    label: "High Priority",
    onChange(checked) {
      jobFilterStore.setFilters({
        highPriorityOnly: checked,
      });
    },
  });
  const withRelatedAoisOnlyCheckbox = createFilterCheckbox({
    label: "Jobs with AOIs",
    onChange(checked) {
      jobFilterStore.setFilters({
        withRelatedAoisOnly: checked,
      });
    },
  });

  quickFilterSection.body.append(
    activeOnlyCheckbox.labelElement,
    highPriorityOnlyCheckbox.labelElement,
    withRelatedAoisOnlyCheckbox.labelElement
  );

  const statusSection = createFilterSection("Job status");
  const statusCheckboxes = JOB_STATUS_OPTIONS.map((statusOption) =>
    createMultiValueFilterCheckbox({
      label: statusOption.label,
      value: statusOption.value,
      getCurrentValues() {
        return jobFilterStore.getSnapshot().filters.statusValues;
      },
      setCurrentValues(nextValues) {
        jobFilterStore.setFilters({
          statusValues: nextValues,
        });
      },
    })
  );

  statusSection.body.append(...statusCheckboxes.map((checkbox) => checkbox.labelElement));

  const prioritySection = createFilterSection("Job priority");
  const priorityCheckboxes = JOB_PRIORITY_OPTIONS.map((priorityOption) =>
    createMultiValueFilterCheckbox({
      label: priorityOption.label,
      value: priorityOption.value,
      getCurrentValues() {
        return jobFilterStore.getSnapshot().filters.priorityValues;
      },
      setCurrentValues(nextValues) {
        jobFilterStore.setFilters({
          priorityValues: nextValues,
        });
      },
    })
  );

  prioritySection.body.append(...priorityCheckboxes.map((checkbox) => checkbox.labelElement));

  const actionsElement = document.createElement("div");
  actionsElement.className = "job-manager-filters__actions";

  const clearButton = document.createElement("calcite-button");
  clearButton.appearance = "outline";
  clearButton.kind = "neutral";
  clearButton.scale = "s";
  clearButton.textContent = "Clear filters";
  clearButton.addEventListener("click", () => {
    jobFilterStore.clearFilters();
  });

  actionsElement.append(clearButton);

  contentElement.append(
    headerElement,
    summaryElement,
    quickFilterSection.element,
    statusSection.element,
    prioritySection.element,
    actionsElement
  );

  filtersPopover.replaceChildren(contentElement);

  return {
    closeButton,
    summaryElement,
    clearButton,
    activeOnlyCheckbox: activeOnlyCheckbox.checkboxElement,
    highPriorityOnlyCheckbox: highPriorityOnlyCheckbox.checkboxElement,
    withRelatedAoisOnlyCheckbox: withRelatedAoisOnlyCheckbox.checkboxElement,
    statusCheckboxes,
    priorityCheckboxes,
  };
}

function createFilterSection(title) {
  const element = document.createElement("section");
  element.className = "job-manager-filters__section";

  const titleElement = document.createElement("h3");
  titleElement.className = "job-manager-filters__section-title";
  titleElement.textContent = title;

  const body = document.createElement("div");
  body.className = "job-manager-filters__checkbox-grid";

  element.append(titleElement, body);

  return {
    element,
    body,
  };
}

function createMultiValueFilterCheckbox({ label, value, getCurrentValues, setCurrentValues }) {
  return createFilterCheckbox({
    label,
    value,
    onChange(checked) {
      const currentValues = new Set(getCurrentValues());

      if (checked) {
        currentValues.add(value);
      } else {
        currentValues.delete(value);
      }

      setCurrentValues([...currentValues]);
    },
  });
}

function createFilterCheckbox({ label, value = "", onChange }) {
  const labelElement = document.createElement("calcite-label");
  labelElement.className = "job-manager-filters__checkbox-label";
  labelElement.layout = "inline";

  const checkboxElement = document.createElement("calcite-checkbox");
  checkboxElement.scale = "s";

  if (value) {
    checkboxElement.value = value;
  }

  checkboxElement.addEventListener("calciteCheckboxChange", () => {
    onChange(Boolean(checkboxElement.checked));
  });

  const textElement = document.createElement("span");
  textElement.textContent = label;

  labelElement.append(checkboxElement, textElement);

  return {
    labelElement,
    checkboxElement,
    value,
  };
}

function syncJobFilterControls({ filtersButton, filterControlRefs, filters }) {
  filterControlRefs.activeOnlyCheckbox.checked = filters.activeOnly;
  filterControlRefs.highPriorityOnlyCheckbox.checked = filters.highPriorityOnly;
  filterControlRefs.withRelatedAoisOnlyCheckbox.checked = filters.withRelatedAoisOnly;

  syncValueCheckboxes(filterControlRefs.statusCheckboxes, filters.statusValues);
  syncValueCheckboxes(filterControlRefs.priorityCheckboxes, filters.priorityValues);

  filterControlRefs.summaryElement.textContent = getActiveJobFilterSummary(filters);
  filterControlRefs.clearButton.disabled = !hasActiveJobFilters(filters);
  filtersButton.indicator = hasActiveJobFilters(filters);
}

function syncValueCheckboxes(checkboxRefs, activeValues) {
  const activeValueSet = new Set(activeValues);

  for (const checkboxRef of checkboxRefs) {
    checkboxRef.checkboxElement.checked = activeValueSet.has(checkboxRef.value);
  }
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

function createJobsOverlay({ jobFilterStore }) {
  const jobList = createJobList({ jobFilterStore });
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
    showJobsForAoi(selectedAoi) {
      return jobList.showJobsForAoi(selectedAoi);
    },
    showJobDetails(selectedJob) {
      return jobList.showJobDetails(selectedJob);
    },
    clearSelectedJob() {
      jobList.clearSelectedJob();
    },
    clearAoiFilter() {
      jobList.clearAoiFilter();
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
  if (!isOpen) {
    moveFocusOutOfPanel(panelElement, triggerButton);
  }

  panelElement.hidden = !isOpen;
  panelElement.inert = !isOpen;
  panelElement.setAttribute("aria-hidden", String(!isOpen));
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}

function moveFocusOutOfPanel(panelElement, fallbackElement) {
  const activeElement = document.activeElement;

  if (!activeElement || !panelElement.contains(activeElement)) {
    return;
  }

  // Move focus before hiding the panel so browsers do not block aria-hidden on focused content.
  fallbackElement?.focus?.({
    preventScroll: true,
  });
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
