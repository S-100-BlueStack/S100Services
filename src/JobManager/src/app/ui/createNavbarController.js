import {
  getActiveJobFilterSummary,
  hasActiveJobFilters,
} from "../../features/jobs/domain/jobFilters.js";
import { JOB_PRIORITY_OPTIONS } from "../../features/jobs/domain/jobPriority.js";
import { JOB_STATUS_OPTIONS } from "../../features/jobs/domain/jobStatus.js";
import {
  JOB_CLUSTER_PRESET_OPTIONS,
  JOB_CLUSTER_STYLE_OPTIONS,
  getJobClusterSettingSummary,
} from "../../features/map/domain/jobClusterSettings.js";
import { THEME_MODE } from "../../features/theme/domain/themeMode.js";

export async function createNavbarController({
  jobFilterStore,
  jobClusterSettingsStore,
  themeStore,
  onTestNotice,
} = {}) {
  await ensureNavbarComponentsDefined();

  const element = await loadNavbarTemplate();
  const jobsButton = getRequiredElement(element, "#jobs-toggle");
  const filtersButton = getRequiredElement(element, "#filters-button");
  const filtersPopover = getRequiredElement(element, "#filters-popover");
  const themeToggle = getRequiredElement(element, "#theme-toggle");
  const testNoticeButton = getRequiredElement(element, "#test-notice-button");

  await configureFiltersPopover({ filtersButton, filtersPopover });

  const filterControlRefs = createJobFilterPopoverContent({
    filtersPopover,
    jobFilterStore,
    jobClusterSettingsStore,
  });

  const unsubscribeJobFilters =
    jobFilterStore?.subscribe?.((snapshot) => {
      syncJobFilterControls({
        filtersButton,
        filterControlRefs,
        filters: snapshot.filters,
      });
    }) ?? (() => {});

  const unsubscribeJobClusterSettings =
    jobClusterSettingsStore?.subscribe?.((snapshot) => {
      syncJobClusterSettingControls({
        filterControlRefs,
        settings: snapshot.settings,
      });
    }) ?? (() => {});

  const unsubscribeTheme =
    themeStore?.subscribe?.((snapshot) => {
      syncThemeToggle({
        themeToggle,
        themeMode: snapshot.themeMode,
      });
    }) ?? (() => {});

  const handleFiltersButtonClick = () => {
    setFilterPopoverOpen(filtersPopover, filtersButton, !filtersPopover.open);
  };

  const handleFiltersCloseClick = () => {
    setFilterPopoverOpen(filtersPopover, filtersButton, false);
  };

  const handleThemeToggleClick = () => {
    themeStore?.toggleThemeMode?.();
  };

  const handleTestNoticeClick = () => {
    onTestNotice?.();
  };

  const handleDocumentClick = (event) => {
    if (!filtersPopover.open) {
      return;
    }

    if (isEventInsideElements(event, [filtersButton, filtersPopover])) {
      return;
    }

    setFilterPopoverOpen(filtersPopover, filtersButton, false);
  };

  filtersButton.addEventListener("click", handleFiltersButtonClick);
  filterControlRefs.closeButton.addEventListener("click", handleFiltersCloseClick);
  themeToggle.addEventListener("click", handleThemeToggleClick);
  testNoticeButton.addEventListener("click", handleTestNoticeClick);
  document.addEventListener("click", handleDocumentClick);

  setFilterPopoverOpen(filtersPopover, filtersButton, false);

  return {
    element,
    jobsButton,
    filtersButton,
    filtersPopover,
    themeToggle,
    destroy() {
      filtersButton.removeEventListener("click", handleFiltersButtonClick);
      filterControlRefs.closeButton.removeEventListener("click", handleFiltersCloseClick);
      themeToggle.removeEventListener("click", handleThemeToggleClick);
      testNoticeButton.removeEventListener("click", handleTestNoticeClick);
      document.removeEventListener("click", handleDocumentClick);
      unsubscribeJobFilters();
      unsubscribeJobClusterSettings();
      unsubscribeTheme();
    },
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

function createJobFilterPopoverContent({
  filtersPopover,
  jobFilterStore,
  jobClusterSettingsStore,
}) {
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

  const clusteringSection = createFilterSection("Job point clustering radius");
  clusteringSection.body.classList.add("job-manager-filters__button-grid");

  const clusteringSummaryElement = document.createElement("p");
  clusteringSummaryElement.className = "job-manager-filters__section-hint";
  clusteringSummaryElement.textContent = "Radius: Medium";
  clusteringSection.element.insertBefore(clusteringSummaryElement, clusteringSection.body);

  const clusterPresetButtons = JOB_CLUSTER_PRESET_OPTIONS.map((presetOption) =>
    createClusterPresetButton({
      option: presetOption,
      onSelect() {
        jobClusterSettingsStore.setSettings({
          preset: presetOption.value,
        });
      },
    })
  );

  clusteringSection.body.append(...clusterPresetButtons.map((button) => button.buttonElement));

  const clusterStyleSection = createFilterSection("Job point cluster style");
  clusterStyleSection.body.classList.add("job-manager-filters__button-grid");

  const clusterStyleButtons = JOB_CLUSTER_STYLE_OPTIONS.map((styleOption) =>
    createClusterPresetButton({
      option: styleOption,
      onSelect() {
        jobClusterSettingsStore.setSettings({
          style: styleOption.value,
        });
      },
    })
  );

  clusterStyleSection.body.append(...clusterStyleButtons.map((button) => button.buttonElement));

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
    clusteringSection.element,
    clusterStyleSection.element,
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
    clusteringSummaryElement,
    clusterPresetButtons,
    clusterStyleButtons,
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

function createClusterPresetButton({ option, onSelect }) {
  const buttonElement = document.createElement("calcite-button");

  buttonElement.className = "job-manager-filters__preset-button";
  buttonElement.appearance = "outline";
  buttonElement.kind = "neutral";
  buttonElement.scale = "s";
  buttonElement.title = option.description;
  buttonElement.textContent = option.label;
  buttonElement.addEventListener("click", onSelect);

  return {
    buttonElement,
    value: option.value,
  };
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

function syncJobClusterSettingControls({ filterControlRefs, settings }) {
  filterControlRefs.clusteringSummaryElement.textContent = getJobClusterSettingSummary(settings);

  syncPresetButtons({
    buttons: filterControlRefs.clusterPresetButtons,
    activeValue: settings.preset,
  });
  syncPresetButtons({
    buttons: filterControlRefs.clusterStyleButtons,
    activeValue: settings.style,
  });
}

function syncThemeToggle({ themeToggle, themeMode }) {
  const isDark = themeMode === THEME_MODE.DARK;
  const nextLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  themeToggle.icon = isDark ? "brightness" : "moon";
  themeToggle.text = nextLabel;
  themeToggle.label = nextLabel;
  themeToggle.title = nextLabel;
  themeToggle.setAttribute("aria-label", nextLabel);
}

function syncPresetButtons({ buttons, activeValue }) {
  for (const presetButton of buttons) {
    const isActive = presetButton.value === activeValue;

    presetButton.buttonElement.appearance = isActive ? "solid" : "outline";
    presetButton.buttonElement.kind = isActive ? "brand" : "neutral";
    presetButton.buttonElement.setAttribute("aria-pressed", String(isActive));
  }
}

function syncValueCheckboxes(checkboxRefs, activeValues) {
  const activeValueSet = new Set(activeValues);

  for (const checkboxRef of checkboxRefs) {
    checkboxRef.checkboxElement.checked = activeValueSet.has(checkboxRef.value);
  }
}

function getRequiredElement(rootElement, selector) {
  const element = rootElement.querySelector(selector);

  if (!element) {
    throw new Error(`Expected navbar element was not found: ${selector}`);
  }

  return element;
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
