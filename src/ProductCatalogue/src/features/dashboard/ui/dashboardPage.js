import { appendValidationViewerAction } from "../../validationViewer/ui/validationViewerAction.js";
import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { fetchDashboardValidationReports } from "../services/dashboardValidationReports.js";
import { loadStatuses } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import {
  createProductHistoryBanner,
  createProductHistoryEventList,
  createProductHistoryStateMessage,
  createProductHistorySummary,
} from "../../timeline/ui/productHistoryRenderers.js";
import {
  createDashboardSummaryRowFilterPatch,
  createDefaultDashboardFilters,
  hasActiveDashboardFilters,
  isDashboardSummaryRowFilterActive,
  normalizeDashboardFilters,
} from "../domain/dashboardFilters.js";
import {
  DASHBOARD_DEFAULT_PAGE_SIZE,
  DASHBOARD_PAGE_SIZE_OPTIONS,
} from "../domain/dashboardQuery.js";
import {
  createDashboardRangeDraftFromRange,
  createDashboardRangeFromDraft,
  formatDashboardRangeDateTime,
  getDashboardRangeKey,
} from "../domain/dashboardRange.js";
import { createDashboardLoadPresentation } from "./dashboardLoadPresentation.js";

const DASHBOARD_METRIC_DESCRIPTIONS = {
  totalActivities: "All recorded operational events in the selected filtered range",
  productsTouched: "Unique products with activity in the selected filtered range",
  openErrors:
    "Product workflow tracks currently in Error or Rejected state, independent of the historical range",
  acceptedForDistribution:
    "Recorded IC-ENC distribution decisions for revision deliveries in the selected range",
  failedOperations:
    "Historical failed activity events in the selected filtered range; click to filter the activity list",
  reportsAvailable: "Stored report files available for matching Products in the selected range",
};

// These explanations describe the reporting scopes, not additional calculations.
const DASHBOARD_METRIC_HELP = {
  openErrors:
    "Product tracks currently in Error or Rejected. Independent of the date range and activity-only filters.",
  failedOperations:
    "Historical failed events matching the selected range and activity filters, not current errors. Select the KPI to filter.",
  distribution:
    "Distributed / (Distributed + Rejected) for recorded outcomes in the selected date and Product scope. Pending is excluded.",
  specification:
    "Events and unique Products by specification in the filtered range. Package members are counted separately.",
  workflow:
    "Current Product tracks, independent of the date range. Export / validate: exporting or validating. At IC-ENC: in transit. Paused: frozen tracks.",
  reports:
    "Stored files in the date and Product scope. Validation files include reports and diagnostics, not validation runs.",
};

const IMPORTANCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "important", label: "Important only" },
  { value: "failed", label: "Failed only" },
];

const REPORT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "any", label: "Any report" },
  { value: "ic-enc", label: "IC-ENC" },
  { value: "internal-validation", label: "Validation" },
];

let dashboardFilters = createDefaultDashboardFilters();
let dashboardRangeDraft = null;
let dashboardRangeDraftAppliedKey = null;
let dashboardHistoryState = createDashboardHistoryState();
let dashboardReportPanelState = createDashboardReportPanelState();
let dashboardReportPanelPage = null;
let dashboardHistoryKeyboardHandlersRegistered = false;
let dashboardHistoryLookupLoadPromise = null;
let dashboardTrendsExpanded = false;
let lastRenderArgs = null;

export function renderDashboardPage({
  range,
  dashboard,
  filters = createDefaultDashboardFilters(),
  loading = false,
  error = null,
  pageSize = DASHBOARD_DEFAULT_PAGE_SIZE,
  pageNumber = 1,
  canGoPrevious = false,
  sortBy = "time",
  sortDirection = "desc",
  pagingMatchesPageSize = true,
  lastSuccessfulLoadAt = null,
}) {
  ensureDashboardHistoryKeyboardHandlers();
  const focusState = captureDashboardControlFocus();
  dashboardFilters = normalizeDashboardFilters(filters, dashboard?.filterOptions);
  lastRenderArgs = {
    range,
    dashboard,
    filters: dashboardFilters,
    loading,
    error,
    pageSize,
    pageNumber,
    canGoPrevious,
    sortBy,
    sortDirection,
    pagingMatchesPageSize,
    lastSuccessfulLoadAt,
  };

  const page = getOrCreateDashboardPage();
  page.replaceChildren(
    createHeader({ range, loading, lastSuccessfulLoadAt }),
    createBody({
      range,
      dashboard,
      loading,
      error,
      pageSize,
      pageNumber,
      canGoPrevious,
      sortBy,
      sortDirection,
      pagingMatchesPageSize,
    })
  );
  restoreDashboardControlFocus(focusState);
}

function getOrCreateDashboardPage() {
  const existingPage = document.getElementById("product-dashboard-page");

  if (existingPage) {
    return existingPage;
  }

  const shell = document.querySelector("calcite-shell");

  if (!shell) {
    throw new Error("Unable to create Dashboard page because calcite-shell was not found.");
  }

  const page = document.createElement("main");
  page.id = "product-dashboard-page";
  page.className = "pc-dashboard-page";
  page.setAttribute("aria-label", "Dashboard");
  shell.appendChild(page);

  return page;
}

function createHeader({ range, loading, lastSuccessfulLoadAt }) {
  const header = document.createElement("header");
  header.className = "pc-dashboard-header";

  const title = document.createElement("h1");
  title.className = "pc-dashboard-visually-hidden";
  title.textContent = "Dashboard";

  const actions = document.createElement("div");
  actions.className = "pc-dashboard-header__actions";
  actions.appendChild(createRangeControls(range));
  actions.appendChild(createRefreshStatus({ loading, lastSuccessfulLoadAt }));

  header.append(title, actions);
  return header;
}

function createRangeControls(range) {
  const wrapper = document.createElement("div");
  wrapper.className = "pc-dashboard-range-builder";
  wrapper.setAttribute("aria-label", "Dashboard range");

  const appliedRangeKey = getDashboardRangeKey(range);

  if (dashboardRangeDraft === null || dashboardRangeDraftAppliedKey !== appliedRangeKey) {
    dashboardRangeDraft = createDashboardRangeDraftFromRange(range);
    dashboardRangeDraftAppliedKey = appliedRangeKey;
  }

  wrapper.append(
    createRangeDateTimeField({
      idPrefix: "dashboard-range-from",
      label: "From",
      dateKey: "fromDate",
      timeKey: "fromTime",
      defaultTime: "00:00",
      required: true,
    }),
    createRangeDateTimeField({
      idPrefix: "dashboard-range-to",
      label: "To",
      dateKey: "toDate",
      timeKey: "toTime",
      defaultTime: "23:59",
      required: false,
    })
  );

  wrapper.addEventListener("focusout", (event) => {
    if (event.relatedTarget && wrapper.contains(event.relatedTarget)) {
      return;
    }

    commitDashboardRangeDraft();
  });

  return wrapper;
}

function createRangeDateTimeField({ idPrefix, label, dateKey, timeKey, defaultTime, required }) {
  const field = document.createElement("div");
  field.className = "pc-dashboard-range-field";
  field.setAttribute("role", "group");

  const labelElement = document.createElement("span");
  labelElement.id = `${idPrefix}-label`;
  labelElement.className = "pc-dashboard-range-field__label";
  labelElement.textContent = label;
  field.setAttribute("aria-labelledby", labelElement.id);

  const datePicker = createRangeDatePicker({
    id: `${idPrefix}-date`,
    label,
    dateKey,
    timeKey,
    required,
  });

  const timeInput = document.createElement("input");
  timeInput.id = `${idPrefix}-time`;
  timeInput.className = "pc-dashboard-range-field__input pc-dashboard-range-field__input--time";
  timeInput.type = "time";
  timeInput.step = "60";
  timeInput.value = dashboardRangeDraft?.[timeKey] ?? "";
  timeInput.setAttribute("aria-label", `${label} time`);
  let timeEditingByKeyboard = false;
  datePicker.onDateChange = (dateValue) => {
    if (dateValue && !timeInput.value) {
      timeInput.value = defaultTime;
    }

    if (!dateValue && !required) {
      timeInput.value = "";
    }

    syncRangeDateTimeDraft({ dateKey, timeKey, dateValue, timeValue: timeInput.value });
    commitDashboardRangeDraft();
  };

  timeInput.addEventListener("keydown", () => {
    timeEditingByKeyboard = true;
  });

  timeInput.addEventListener("pointerdown", () => {
    timeEditingByKeyboard = false;
  });

  timeInput.addEventListener("input", () => {
    syncRangeDateTimeDraft({
      dateKey,
      timeKey,
      dateValue: getDashboardDateButtonValue(datePicker.button),
      timeValue: timeInput.value,
    });
  });

  timeInput.addEventListener("change", () => {
    syncRangeDateTimeDraft({
      dateKey,
      timeKey,
      dateValue: getDashboardDateButtonValue(datePicker.button),
      timeValue: timeInput.value,
    });

    if (!timeEditingByKeyboard) {
      scheduleDashboardTimeCommit(timeInput);
    }
  });

  field.append(labelElement, datePicker.root, timeInput);
  return field;
}

function createRangeDatePicker({ id, label, dateKey, timeKey, required }) {
  ensureDashboardDatePickerDismissHandlers();

  const root = document.createElement("div");
  root.className = "pc-dashboard-date-picker";

  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.className =
    "pc-dashboard-range-field__input pc-dashboard-range-field__input--date pc-dashboard-range-date-button";
  button.setAttribute("aria-label", `${label} date`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  setDashboardDateButtonValue(button, dashboardRangeDraft?.[dateKey] ?? "");

  const panel = document.createElement("div");
  panel.className = "pc-dashboard-date-picker__panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `${label} date picker`);

  const result = {
    root,
    button,
    onDateChange: null,
  };
  const clearValue = required
    ? null
    : () => {
        setDashboardDateButtonValue(button, "");
        closeDashboardDatePickers();
        button.focus({ preventScroll: true });
        result.onDateChange?.("");
      };

  root.dataset.viewDate = getDashboardDateButtonValue(button) || getTodayDateValue();

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDashboardDatePicker({
      root,
      button,
      panel,
      onSelect: (nextDate) => {
        setDashboardDateButtonValue(button, nextDate);
        closeDashboardDatePickers();
        button.focus({ preventScroll: true });
        result.onDateChange?.(nextDate);
      },
      onClear: clearValue,
    });
  });

  if (!required) {
    button.setAttribute("aria-keyshortcuts", "Delete Backspace");
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      event.preventDefault();
      clearValue();
    });
  }

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  panel.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      shiftDashboardDatePickerMonth({
        root,
        panel,
        delta: event.deltaY > 0 ? 1 : -1,
        onSelect: (nextDate) => {
          setDashboardDateButtonValue(button, nextDate);
          closeDashboardDatePickers();
          button.focus({ preventScroll: true });
          result.onDateChange?.(nextDate);
        },
        onClear: clearValue,
      });
    },
    { passive: false }
  );

  root.append(button, panel);

  renderDashboardDatePickerPanel({
    root,
    panel,
    onSelect: (nextDate) => {
      setDashboardDateButtonValue(button, nextDate);
      closeDashboardDatePickers();
      button.focus({ preventScroll: true });
      result.onDateChange?.(nextDate);
    },
    onClear: clearValue,
  });

  return result;
}

function syncRangeDateTimeDraft({ dateKey, timeKey, dateValue, timeValue }) {
  dashboardRangeDraft = {
    ...createEmptyDashboardRangeDraft(),
    ...dashboardRangeDraft,
    [dateKey]: dateValue,
    [timeKey]: timeValue,
  };
}

function toggleDashboardDatePicker({ root, button, panel, onSelect, onClear }) {
  const willOpen = panel.hidden;
  closeDashboardDatePickers(root);

  if (!willOpen) {
    closeDashboardDatePicker(root);
    return;
  }

  root.dataset.viewDate =
    getDashboardDateButtonValue(button) || root.dataset.viewDate || getTodayDateValue();
  renderDashboardDatePickerPanel({ root, panel, onSelect, onClear });

  root.classList.add("is-open");
  panel.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function closeDashboardDatePickers(exceptRoot = null) {
  document.querySelectorAll(".pc-dashboard-date-picker.is-open").forEach((root) => {
    if (root !== exceptRoot) {
      closeDashboardDatePicker(root);
    }
  });
}

function closeDashboardDatePicker(root) {
  const panel = root.querySelector(".pc-dashboard-date-picker__panel");
  const button = root.querySelector(".pc-dashboard-range-date-button");

  root.classList.remove("is-open");

  if (panel instanceof HTMLElement) {
    panel.hidden = true;
  }

  if (button instanceof HTMLButtonElement) {
    button.setAttribute("aria-expanded", "false");
  }
}

let dashboardDatePickerDismissHandlersRegistered = false;

function ensureDashboardDatePickerDismissHandlers() {
  if (dashboardDatePickerDismissHandlersRegistered) {
    return;
  }

  dashboardDatePickerDismissHandlersRegistered = true;
  document.addEventListener("click", () => closeDashboardDatePickers());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDashboardDatePickers();
    }
  });
}

function renderDashboardDatePickerPanel({ root, panel, onSelect, onClear }) {
  const view =
    parseDashboardDateValue(root.dataset.viewDate) ?? parseDashboardDateValue(getTodayDateValue());
  const selectedDate = getDashboardDateButtonValue(
    root.querySelector(".pc-dashboard-range-date-button")
  );
  const firstDay = new Date(view.year, view.month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const previousMonthDays = new Date(view.year, view.month - 1, 0).getDate();

  // Keep the month-navigation buttons mounted so keyboard focus is not lost
  // (or interpreted as leaving the range controls) when the month changes.
  let header = panel.querySelector(".pc-dashboard-date-picker__header");

  if (!header) {
    header = document.createElement("div");
    header.className = "pc-dashboard-date-picker__header";

    const previousButton = createDashboardDatePickerNavButton("Previous month", "\u2039");
    previousButton.addEventListener("click", () => {
      shiftDashboardDatePickerMonth({ root, panel, delta: -1, onSelect, onClear });
    });

    const title = document.createElement("div");
    title.className = "pc-dashboard-date-picker__title";
    title.setAttribute("aria-live", "polite");

    const nextButton = createDashboardDatePickerNavButton("Next month", "\u203a");
    nextButton.addEventListener("click", () => {
      shiftDashboardDatePickerMonth({ root, panel, delta: 1, onSelect, onClear });
    });

    header.append(previousButton, title, nextButton);
    panel.appendChild(header);

    const weekdays = document.createElement("div");
    weekdays.className = "pc-dashboard-date-picker__weekdays";

    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((weekday) => {
      const weekdayElement = document.createElement("span");
      weekdayElement.textContent = weekday;
      weekdays.appendChild(weekdayElement);
    });

    panel.appendChild(weekdays);
  }

  header.querySelector(".pc-dashboard-date-picker__title").textContent =
    formatDashboardCalendarMonthTitle(view);

  panel.querySelector(".pc-dashboard-date-picker__days")?.remove();
  panel.querySelector(".pc-dashboard-date-picker__clear")?.remove();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const todayDateValue = getTodayDateValue();
  const days = document.createElement("div");
  days.className = "pc-dashboard-date-picker__days";

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - startOffset + 1;
    let year = view.year;
    let month = view.month;
    let day = dayOffset;
    let isOutsideMonth = false;

    if (dayOffset < 1) {
      const previousMonth = shiftDashboardMonth(view.year, view.month, -1);
      year = previousMonth.year;
      month = previousMonth.month;
      day = previousMonthDays + dayOffset;
      isOutsideMonth = true;
    } else if (dayOffset > daysInMonth) {
      const nextMonth = shiftDashboardMonth(view.year, view.month, 1);
      year = nextMonth.year;
      month = nextMonth.month;
      day = dayOffset - daysInMonth;
      isOutsideMonth = true;
    }

    const dateValue = formatDashboardDateValue({ year, month, day });
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "pc-dashboard-date-picker__day";
    dayButton.textContent = String(day);
    dayButton.dataset.dateValue = dateValue;
    dayButton.setAttribute(
      "aria-label",
      `${dateFormatter.format(new Date(year, month - 1, day))}${
        dateValue === selectedDate ? ", selected" : ""
      }`
    );
    if (dateValue === todayDateValue) {
      dayButton.setAttribute("aria-current", "date");
    }
    dayButton.classList.toggle("is-outside-month", isOutsideMonth);
    dayButton.classList.toggle("is-selected", dateValue === selectedDate);
    dayButton.classList.toggle("is-today", dateValue === todayDateValue);
    dayButton.addEventListener("click", () => {
      root.dataset.viewDate = dateValue;
      onSelect(dateValue);
    });
    days.appendChild(dayButton);
  }

  panel.appendChild(days);

  if (onClear && selectedDate) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "pc-dashboard-date-picker__clear";
    clearButton.textContent = "Clear date";
    clearButton.setAttribute("aria-label", "Clear optional To date");
    clearButton.addEventListener("click", onClear);
    panel.appendChild(clearButton);
  }
}

function createDashboardDatePickerNavButton(label, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-date-picker__nav";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  return button;
}

function shiftDashboardDatePickerMonth({ root, panel, delta, onSelect, onClear }) {
  const view =
    parseDashboardDateValue(root.dataset.viewDate) ?? parseDashboardDateValue(getTodayDateValue());
  const shiftedView = shiftDashboardMonth(view.year, view.month, delta);
  root.dataset.viewDate = formatDashboardDateValue({ ...shiftedView, day: 1 });
  renderDashboardDatePickerPanel({ root, panel, onSelect, onClear });
}

function shiftDashboardMonth(year, month, delta) {
  const shifted = new Date(year, month - 1 + delta, 1);
  return {
    year: shifted.getFullYear(),
    month: shifted.getMonth() + 1,
  };
}

function parseDashboardDateValue(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatDashboardDateValue({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTodayDateValue() {
  const today = new Date();
  return formatDashboardDateValue({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  });
}

function getDashboardDateButtonValue(button) {
  return button?.dataset?.dateValue ?? "";
}

function setDashboardDateButtonValue(button, value) {
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? value : "";
  button.dataset.dateValue = normalizedValue;
  button.textContent = normalizedValue
    ? formatDashboardDateButtonText(normalizedValue)
    : "dd-mm-yyyy";
  button.classList.toggle("is-empty", !normalizedValue);

  const root = button.closest(".pc-dashboard-date-picker");
  if (root && normalizedValue) {
    root.dataset.viewDate = normalizedValue;
  }
}

function formatDashboardDateButtonText(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "dd-mm-yyyy";
}

function formatDashboardCalendarMonthTitle({ year, month }) {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function createEmptyDashboardRangeDraft() {
  return {
    fromDate: "",
    fromTime: "",
    toDate: "",
    toTime: "",
  };
}

function scheduleDashboardTimeCommit(timeInput) {
  window.setTimeout(() => {
    if (!timeInput.isConnected) {
      return;
    }

    const rangeBuilder = timeInput.closest(".pc-dashboard-range-builder");
    const activeElement = document.activeElement;

    if (
      rangeBuilder &&
      activeElement &&
      activeElement !== timeInput &&
      rangeBuilder.contains(activeElement)
    ) {
      return;
    }

    commitDashboardRangeDraft();
  }, 0);
}

function commitDashboardRangeDraft() {
  if (!createDashboardRangeFromDraft(dashboardRangeDraft)) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("pc-dashboard-range-change", {
      detail: { draft: { ...dashboardRangeDraft } },
    })
  );
}

function captureDashboardControlFocus() {
  const activeElement = document.activeElement;

  if (
    !(
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLSelectElement ||
      activeElement instanceof HTMLButtonElement
    )
  ) {
    return null;
  }

  const sortKey = activeElement.dataset.dashboardSortKey;
  const filterKey = activeElement.dataset.dashboardFilterKey;
  const focusKey = activeElement.dataset.dashboardFocusKey;
  const panelAction = activeElement.dataset.dashboardPanelAction;
  const rangeInputId = activeElement.id?.startsWith("dashboard-range-") ? activeElement.id : null;
  const pageSizeControl = activeElement.hasAttribute("data-dashboard-page-size");

  if (!sortKey && !filterKey && !focusKey && !panelAction && !rangeInputId && !pageSizeControl) {
    return null;
  }

  return {
    sortKey,
    filterKey,
    focusKey,
    panelAction,
    rangeInputId,
    pageSizeControl,
    selectionStart: activeElement instanceof HTMLInputElement ? activeElement.selectionStart : null,
    selectionEnd: activeElement instanceof HTMLInputElement ? activeElement.selectionEnd : null,
  };
}

function restoreDashboardControlFocus(focusState) {
  if (!focusState) {
    return;
  }

  const selector = focusState.sortKey
    ? `[data-dashboard-sort-key="${CSS.escape(focusState.sortKey)}"]`
    : focusState.rangeInputId
      ? `#${CSS.escape(focusState.rangeInputId)}`
      : focusState.pageSizeControl
        ? "[data-dashboard-page-size]"
        : focusState.focusKey
          ? `[data-dashboard-focus-key="${CSS.escape(focusState.focusKey)}"]`
          : focusState.panelAction
            ? `[data-dashboard-panel-action="${CSS.escape(focusState.panelAction)}"]`
            : `[data-dashboard-filter-key="${focusState.filterKey}"]`;
  const nextElement = document.querySelector(selector);

  if (
    !(
      nextElement instanceof HTMLInputElement ||
      nextElement instanceof HTMLSelectElement ||
      nextElement instanceof HTMLButtonElement
    )
  ) {
    return;
  }

  nextElement.focus({ preventScroll: true });

  if (
    nextElement instanceof HTMLInputElement &&
    Number.isInteger(focusState.selectionStart) &&
    Number.isInteger(focusState.selectionEnd)
  ) {
    nextElement.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
  }
}

function createRefreshStatus({ loading, lastSuccessfulLoadAt }) {
  const status = document.createElement("div");
  status.className = "pc-dashboard-refresh-status";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-refresh-button";
  button.dataset.dashboardFocusKey = "refresh";
  button.disabled = loading;
  button.setAttribute("aria-label", "Refresh dashboard");
  button.title = "Refresh activity";

  const icon = document.createElement("calcite-icon");
  icon.icon = "refresh";
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);

  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("pc-dashboard-refresh"));
  });

  status.appendChild(button);

  if (lastSuccessfulLoadAt) {
    const presentation = createDashboardLoadPresentation(lastSuccessfulLoadAt);
    const timestamp = document.createElement("time");
    timestamp.className = "pc-dashboard-last-load";
    timestamp.dateTime = new Date(lastSuccessfulLoadAt).toISOString();
    timestamp.textContent = presentation.text;
    timestamp.title = presentation.title;
    timestamp.setAttribute("aria-label", presentation.ariaLabel);
    status.appendChild(timestamp);
  }

  return status;
}

function createBody({
  range,
  dashboard,
  loading,
  error,
  pageSize,
  pageNumber,
  canGoPrevious,
  sortBy,
  sortDirection,
  pagingMatchesPageSize,
}) {
  const body = document.createElement("section");
  body.className = "pc-dashboard-body";

  if (dashboard?.isDemo) {
    body.appendChild(createDemoBanner(dashboard));
  }

  if (error && !dashboard) {
    body.appendChild(createStateMessage("Dashboard could not be loaded", error));
    return body;
  }

  if (loading && !dashboard) {
    body.appendChild(createStateMessage("Loading dashboard activity...", range.displayLabel));
    return body;
  }

  if (!dashboard) {
    body.appendChild(createStateMessage("No dashboard data loaded", range.displayLabel));
    return body;
  }

  if (error) {
    body.appendChild(createDashboardRequestError(error));
  }

  const filterOptions = dashboard.filterOptions ?? { types: [], statuses: [], products: [] };
  dashboardFilters = normalizeDashboardFilters(dashboardFilters, filterOptions);

  body.append(
    createDashboardGrid({
      dashboard,
      sourceActivityCount: dashboard.paging?.total ?? dashboard.activities.length,
      loading,
      filters: dashboardFilters,
      filterOptions,
      pageSize,
      pageNumber,
      canGoPrevious,
      sortBy,
      sortDirection,
      pagingMatchesPageSize,
    })
  );

  return body;
}

function createDemoBanner(dashboard) {
  const banner = document.createElement("section");
  banner.className = "pc-dashboard-demo-banner";
  banner.setAttribute("aria-label", "Demo data notice");

  const title = document.createElement("strong");
  title.textContent = "Demo data";

  const message = document.createElement("span");
  message.textContent = dashboard.loadError
    ? ` Backend endpoint is not available yet. ${dashboard.loadError}`
    : " Backend endpoint is not available yet.";

  banner.append(title, message);
  return banner;
}

function createDashboardRequestError(message) {
  const banner = document.createElement("section");
  banner.className = "pc-dashboard-request-error";
  banner.setAttribute("role", "status");

  const title = document.createElement("strong");
  title.textContent = "Dashboard refresh failed";
  const text = document.createElement("span");
  text.textContent = ` ${message} Showing the last successful result.`;

  banner.append(title, text);
  return banner;
}

function createStateMessage(title, description) {
  const state = document.createElement("section");
  state.className = "pc-dashboard-state";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = description;

  state.append(heading, text);
  return state;
}

// These values describe recorded workflow outcomes, not a claim about external
// transport. Keep the backend's live/simulation split untouched for other consumers.
function getRecordedDistributionCount(distribution, key) {
  const values = [distribution?.live?.[key], distribution?.simulation?.[key]].filter(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function createSummaryCards(dashboard) {
  const cards = document.createElement("section");
  cards.className = "pc-dashboard-summary";
  cards.setAttribute("aria-label", "Dashboard summary");
  const summary = dashboard?.summary ?? {};
  const health = dashboard?.operationalHealth;
  const accepted = getRecordedDistributionCount(dashboard?.distribution, "accepted");

  const metrics = [
    { key: "totalActivities", label: "Activities", value: summary.totalActivities ?? 0 },
    { key: "productsTouched", label: "Products touched", value: summary.productsTouched ?? 0 },
    {
      key: "openErrors",
      label: "Open errors",
      value: health?.openErrors ?? "—",
      tone: "danger",
      unavailable: health?.openErrors === null || health?.openErrors === undefined,
    },
    {
      key: "acceptedForDistribution",
      label: "Distributed",
      value: accepted ?? "—",
      tone: "positive",
      unavailable: accepted === null,
    },
    {
      key: "failedOperations",
      label: "Failed events",
      value: summary.failedOperations ?? 0,
      tone: "danger",
      interactive: true,
    },
    { key: "reportsAvailable", label: "Reports", value: summary.reportsAvailable ?? 0 },
  ];

  for (const metric of metrics) {
    const card = document.createElement(metric.interactive ? "button" : "article");
    card.className = `pc-dashboard-summary-card pc-dashboard-summary-card--${metric.key}`;
    if (metric.tone) card.classList.add(`is-${metric.tone}`);
    if (metric.unavailable) card.classList.add("is-unavailable");
    if (metric.interactive) {
      const isFiltered = dashboardFilters.importance === "failed";
      card.type = "button";
      card.classList.add("is-interactive");
      card.dataset.dashboardFocusKey = "failed-kpi";
      card.setAttribute("aria-pressed", String(isFiltered));
      card.setAttribute(
        "aria-label",
        `${metric.value} failed events. ${isFiltered ? "Clear failed activity filter" : "Filter to failed activity"}`
      );
      card.addEventListener("click", () => {
        updateDashboardFilters({ importance: isFiltered ? "all" : "failed" });
      });
    }

    const label = document.createElement("div");
    label.className = "pc-dashboard-summary-card__label";
    label.textContent = metric.label;

    const value = document.createElement("div");
    value.className = "pc-dashboard-summary-card__value";
    value.textContent = String(metric.value);

    // The compact cards carry semantic descriptions for assistive technology;
    // duplicate visible subtitles and native hover tooltips add no useful detail.
    const description = document.createElement("div");
    description.className = "pc-dashboard-visually-hidden";
    description.textContent = DASHBOARD_METRIC_DESCRIPTIONS[metric.key];

    card.append(label, value, description);
    if (DASHBOARD_METRIC_HELP[metric.key]) {
      // Keep the help button outside the KPI button so help never changes a filter.
      const slot = document.createElement("div");
      slot.className = "pc-dashboard-summary-card-slot";
      card.classList.add("has-metric-help");
      slot.append(card, createMetricHelpButton(metric.key, metric.label));
      cards.appendChild(slot);
    } else {
      cards.appendChild(card);
    }
  }

  return cards;
}

function createDashboardGrid({
  dashboard,
  sourceActivityCount,
  loading,
  filters,
  filterOptions,
  pageSize,
  pageNumber,
  canGoPrevious,
  sortBy,
  sortDirection,
  pagingMatchesPageSize,
}) {
  const grid = document.createElement("section");
  grid.className = "pc-dashboard-grid";

  const timeZone = dashboard.range?.timeZone;

  const main = document.createElement("div");
  main.className = "pc-dashboard-grid__main";
  main.append(
    createSummaryCards(dashboard),
    createActivityList(dashboard.activities, loading, timeZone, {
      filters,
      filterOptions,
      sourceActivityCount,
      paging: dashboard.paging,
      pageSize,
      pageNumber,
      canGoPrevious,
      sortBy,
      sortDirection,
      pagingMatchesPageSize,
    })
  );

  const aside = document.createElement("aside");
  aside.className = "pc-dashboard-grid__aside";
  const hasDetailPanel = dashboardHistoryState.isOpen || dashboardReportPanelState.isOpen;
  aside.classList.toggle("has-history-panel", hasDetailPanel);

  if (dashboardReportPanelState.isOpen) {
    aside.appendChild(createDashboardReportPanel());
  } else if (dashboardHistoryState.isOpen) {
    aside.appendChild(createDashboardHistoryPanel());
  } else {
    const summaries = document.createElement("div");
    summaries.className = "pc-dashboard-overview-row";
    summaries.append(
      createSummaryRows({
        title: "Status summary",
        rows: dashboard.statusSummary,
        filterKey: "status",
        filters,
      }),
      createSummaryRows({
        title: "Operation summary",
        rows: dashboard.operationSummary,
        filterKey: "type",
        filters,
      })
    );
    aside.appendChild(summaries);
    if (dashboard.distribution) {
      aside.appendChild(createDistributionOverview(dashboard.distribution));
    }
    if (dashboard.activityTrend !== null && dashboard.activityTrend !== undefined) {
      aside.appendChild(
        createActivityTrendPanel(dashboard.activityTrend, dashboard.distributionTrend)
      );
    }
    if (hasAdditionalDashboardInsights(dashboard)) {
      aside.appendChild(createAdditionalInsightsOverview(dashboard));
    }
  }

  grid.append(main, aside);
  return grid;
}

function createActivityList(
  activities,
  loading,
  timeZone,
  {
    filters,
    filterOptions,
    sourceActivityCount,
    paging,
    pageSize,
    pageNumber,
    canGoPrevious,
    sortBy,
    sortDirection,
    pagingMatchesPageSize,
  }
) {
  const section = document.createElement("section");
  section.className = "pc-dashboard-panel pc-dashboard-activity";

  const hasFilters = hasActiveDashboardFilters(filters);
  const header = createPanelHeader({
    title: "Activity list",
    count:
      sourceActivityCount !== activities.length
        ? `${activities.length} / ${sourceActivityCount}`
        : activities.length,
    status: loading ? "Refreshing" : null,
  });

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "pc-dashboard-activity__table-wrapper";

  tableWrapper.appendChild(createActivityTable(activities, timeZone, { sortBy, sortDirection }));
  if (activities.length === 0) {
    const emptyText = hasFilters
      ? "No activity matches the selected filters."
      : "No activity found for the selected range.";
    tableWrapper.appendChild(createEmptyText(emptyText));
  }

  section.append(
    header,
    createActivityFilterBar({ filters, filterOptions, hasFilters }),
    tableWrapper,
    createActivityPagination({
      paging,
      pageSize,
      pageNumber,
      canGoPrevious,
      loading,
      pagingMatchesPageSize,
    })
  );
  return section;
}

function createActivityFilterBar({ filters, filterOptions, hasFilters }) {
  const form = document.createElement("form");
  form.className = "pc-dashboard-filters";
  form.setAttribute("aria-label", "Dashboard activity filters");
  form.addEventListener("submit", (event) => event.preventDefault());

  form.append(
    createSearchFilter(filters.search),
    createSelectFilter({
      key: "type",
      label: "Type",
      value: filters.type,
      options: [{ value: "all", label: "All types" }, ...filterOptions.types],
    }),
    createSelectFilter({
      key: "status",
      label: "Status",
      value: filters.status,
      options: [{ value: "all", label: "All statuses" }, ...filterOptions.statuses],
    }),
    createSelectFilter({
      key: "importance",
      label: "Importance",
      value: filters.importance,
      options: IMPORTANCE_OPTIONS,
    }),
    createSelectFilter({
      key: "reports",
      label: "Reports",
      value: filters.reports,
      options: REPORT_OPTIONS,
    }),
    createSelectFilter({
      key: "product",
      label: "Product",
      value: filters.product,
      options: [{ value: "all", label: "All products" }, ...filterOptions.products],
    }),
    createClearFiltersButton(hasFilters)
  );

  return form;
}

function createSearchFilter(value) {
  const wrapper = createFilterWrapper("Search");
  const input = document.createElement("input");
  input.className = "pc-dashboard-filter__control pc-dashboard-filter__search";
  input.type = "search";
  input.value = value;
  input.placeholder = "Search activity...";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dataset.dashboardFilterKey = "search";
  input.setAttribute("aria-label", "Search dashboard activity");
  input.addEventListener("input", () =>
    updateDashboardFilters({ search: input.value }, { debounce: true })
  );

  wrapper.appendChild(input);
  return wrapper;
}

function createSelectFilter({ key, label, value, options }) {
  const wrapper = createFilterWrapper(label);
  const select = document.createElement("select");
  select.className = "pc-dashboard-filter__control";
  select.value = value;
  select.dataset.dashboardFilterKey = key;
  select.setAttribute("aria-label", `${label} filter`);

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  }

  select.value = value;
  select.addEventListener("change", () => updateDashboardFilters({ [key]: select.value }));

  wrapper.appendChild(select);
  return wrapper;
}

function createFilterWrapper(labelText) {
  const wrapper = document.createElement("label");
  wrapper.className = "pc-dashboard-filter";

  const label = document.createElement("span");
  label.className = "pc-dashboard-filter__label";
  label.textContent = labelText;

  wrapper.appendChild(label);
  return wrapper;
}

function createClearFiltersButton(hasFilters) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-filter-clear";
  button.textContent = "Clear filters";
  button.disabled = !hasFilters;
  button.addEventListener("click", () => {
    updateDashboardFilters(createDefaultDashboardFilters());
  });

  return button;
}

function updateDashboardFilters(partialFilters, { debounce = false } = {}) {
  dashboardFilters = normalizeDashboardFilters({ ...dashboardFilters, ...partialFilters });
  document.dispatchEvent(
    new CustomEvent("pc-dashboard-filter-change", {
      detail: { filters: dashboardFilters, debounce },
    })
  );
}

function rerenderDashboardPage(focusState = null) {
  if (!lastRenderArgs) {
    return;
  }

  renderDashboardPage(lastRenderArgs);
  restoreDashboardControlFocus(focusState);
}

function createActivityPagination({
  paging,
  pageSize,
  pageNumber,
  canGoPrevious,
  loading,
  pagingMatchesPageSize,
}) {
  const footer = document.createElement("footer");
  footer.className = "pc-dashboard-pagination";

  const total = Number(paging?.total) || 0;
  const returned = Number(paging?.returned) || 0;
  const displayedPageSize = Number(paging?.pageSize) || returned || 1;
  const totalPages = total > 0 ? Math.ceil(total / displayedPageSize) : 1;

  const firstRow = total > 0 ? (pageNumber - 1) * displayedPageSize + 1 : 0;
  const lastRow = total > 0 ? Math.min(firstRow + returned - 1, total) : 0;
  const rowRange = firstRow === lastRow ? String(firstRow) : `${firstRow}-${lastRow}`;

  const meta = document.createElement("span");
  meta.className = "pc-dashboard-pagination__meta";
  meta.textContent = `Page ${pageNumber} of ${totalPages} \u00b7 ${rowRange} of ${total}`;

  const controls = document.createElement("div");
  controls.className = "pc-dashboard-pagination__controls";

  const actions = document.createElement("div");
  actions.className = "pc-dashboard-pagination__actions";
  actions.append(
    createPaginationButton(
      "Previous",
      "previous",
      loading || !pagingMatchesPageSize || !canGoPrevious
    ),
    createPaginationButton("Next", "next", loading || !pagingMatchesPageSize || !paging?.hasMore)
  );

  controls.append(createPageSizeControl(pageSize), actions);
  footer.append(meta, controls);
  return footer;
}

function createPageSizeControl(pageSize) {
  const label = document.createElement("label");
  label.className = "pc-dashboard-page-size";

  const text = document.createElement("span");
  text.textContent = "Rows per page";

  const select = document.createElement("select");
  select.className = "pc-dashboard-page-size__select";
  select.dataset.dashboardPageSize = "true";
  select.setAttribute("aria-label", "Rows per page");

  for (const option of DASHBOARD_PAGE_SIZE_OPTIONS) {
    const element = document.createElement("option");
    element.value = String(option);
    element.textContent = String(option);
    select.appendChild(element);
  }

  select.value = String(pageSize);
  select.addEventListener("change", () => {
    document.dispatchEvent(
      new CustomEvent("pc-dashboard-page-size-change", {
        detail: { pageSize: Number(select.value) },
      })
    );
  });

  label.append(text, select);
  return label;
}

function createPaginationButton(label, direction, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-pagination__button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("pc-dashboard-page-change", { detail: { direction } }));
  });
  return button;
}

function createActivityTable(activities, timeZone, { sortBy, sortDirection }) {
  const table = document.createElement("table");
  table.className = "pc-dashboard-activity-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  for (const label of ["Time", "Product", "Activity", "Status", "Actions"]) {
    const th = document.createElement("th");
    th.scope = "col";
    const sortKey = label.toLowerCase();
    if (label === "Actions") {
      th.className = "pc-dashboard-activity-table__links-heading";
      th.textContent = label;
    } else {
      const active = sortKey === sortBy;
      if (active) {
        th.setAttribute("aria-sort", sortDirection === "asc" ? "ascending" : "descending");
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pc-dashboard-sort-button";
      button.dataset.dashboardSortKey = sortKey;
      const nextDirection = active
        ? sortDirection === "asc"
          ? "descending"
          : "ascending"
        : sortKey === "time"
          ? "descending"
          : "ascending";
      button.setAttribute("aria-label", `${label}: sort ${nextDirection}`);
      button.title = `Sort ${label} ${nextDirection}`;
      button.append(label);
      const indicator = document.createElement("span");
      indicator.setAttribute("aria-hidden", "true");
      indicator.textContent = active ? (sortDirection === "asc" ? "↑" : "↓") : "↕";
      button.appendChild(indicator);
      button.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("pc-dashboard-sort-change", {
            detail: { sortBy: sortKey },
          })
        );
      });
      th.appendChild(button);
    }
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");

  for (const activity of activities) {
    tbody.appendChild(createActivityRow(activity, timeZone));
  }

  table.append(thead, tbody);
  return table;
}

function createActivityRow(activity, timeZone) {
  const row = document.createElement("tr");
  row.className = `pc-dashboard-activity-table__row is-${activity.severity}`;
  row.classList.toggle(
    "is-history-selected",
    isDashboardHistoryActivitySelected(activity) || isDashboardReportActivitySelected(activity)
  );

  const time = document.createElement("td");
  time.className = "pc-dashboard-activity-table__time";
  time.textContent = formatDashboardRangeDateTime(activity.timestamp, { timeZone });

  const product = document.createElement("td");
  product.className = "pc-dashboard-activity-table__product";
  product.textContent = activity.datasetName || "-";

  const activityCell = document.createElement("td");
  activityCell.className = `pc-dashboard-activity-table__activity tone-${getDashboardOperationTone(activity.type)}`;
  activityCell.title = [
    activity.title,
    activity.description,
    ...(activity.details ?? []).map((item) =>
      item.label ? `${item.label}: ${item.value}` : item.value
    ),
  ]
    .filter(Boolean)
    .join(" | ");
  activityCell.append(
    createActivityTitle(activity),
    createActivityDescription(activity),
    createActivityDetails(activity)
  );

  const status = document.createElement("td");
  status.appendChild(createStatusPill(activity.status, activity.severity));

  const links = document.createElement("td");
  links.appendChild(createActivityLinks(activity));

  row.append(time, product, activityCell, status, links);
  return row;
}

function createActivityTitle(activity) {
  const title = document.createElement("div");
  title.className = "pc-dashboard-activity-table__title";
  title.textContent = activity.title;
  return title;
}

function createActivityDescription(activity) {
  const description = document.createElement("div");
  description.className = "pc-dashboard-activity-table__description";
  description.textContent = activity.description || activity.actor || "-";
  return description;
}

function createActivityDetails(activity) {
  const details = document.createElement("div");
  details.className = "pc-dashboard-activity-table__details";
  details.textContent = (activity.details ?? [])
    .map((item) => (item.label ? `${item.label}: ${item.value}` : item.value))
    .filter(Boolean)
    .join(" · ");
  return details;
}

function createStatusPill(status, severity) {
  const pill = document.createElement("span");
  pill.className = `pc-dashboard-status-pill is-${status} is-${severity}`;
  pill.textContent = toTitleCase(status);
  return pill;
}

function createActivityLinks(activity) {
  const actions = document.createElement("div");
  // Preserve the onboarding tour anchor while keeping the updated action layout.
  actions.className = "pc-dashboard-activity-actions pc-dashboard-activity-links";
  actions.append(
    createDashboardHistoryButton(activity),
    createDashboardReportButton(activity, "ic-enc"),
    createDashboardReportButton(activity, "internal"),
    createDashboardNavigationDropdown(activity)
  );
  return actions;
}

function createDashboardNavigationDropdown(activity) {
  const dropdown = document.createElement("calcite-dropdown");
  dropdown.className = "pc-dashboard-navigation-dropdown";
  dropdown.setAttribute("placement", "bottom-end");
  dropdown.setAttribute("overlay-positioning", "fixed");
  dropdown.setAttribute("scale", "s");
  dropdown.setAttribute("width", "s");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.slot = "trigger";
  trigger.className = "pc-dashboard-link-button pc-dashboard-action-trigger";
  trigger.textContent = "Links";
  trigger.dataset.dashboardFocusKey = `links:${getDashboardPanelActionKey(activity, "menu")}`;
  trigger.setAttribute(
    "aria-label",
    `Open Review or Analyze for ${activity.datasetName || "this activity"}`
  );

  const group = document.createElement("calcite-dropdown-group");
  group.setAttribute("selection-mode", "none");
  group.append(
    createProductActionMenuItem({
      label: "Review",
      enabled: activity.links.review && activity.datasetName,
      url: activity.datasetName ? buildReviewUrl([activity.datasetName]) : null,
    }),
    createProductActionMenuItem({
      label: "Analyze",
      enabled: activity.links.analyze && activity.datasetName,
      url: activity.datasetName ? buildAnalyzeUrl([activity.datasetName]) : null,
    })
  );
  // Avoid opening a menu that has no permitted destinations.
  trigger.disabled = Array.from(group.children).every((item) => item.disabled);
  dropdown.append(trigger, group);
  return dropdown;
}

function createProductActionMenuItem({ label, enabled, url }) {
  const item = document.createElement("calcite-dropdown-item");
  item.textContent = label;
  item.setAttribute("label", label);
  item.disabled = !enabled || !url;
  if (!item.disabled) {
    item.href = url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
  }
  return item;
}

function createDashboardHistoryButton(activity) {
  const active = isDashboardHistoryActivitySelected(activity);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-link-button";
  button.textContent = "History";
  button.disabled = !activity.links.history || !normalizeDashboardDatasetName(activity.datasetName);
  button.dataset.dashboardPanelAction = getDashboardPanelActionKey(activity, "history");
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute(
    "aria-label",
    `${active ? "Close" : "Open"} History for ${activity.datasetName || "this activity"}`
  );
  if (!button.disabled) {
    button.addEventListener("click", () => {
      void openDashboardHistory(activity);
    });
  }
  return button;
}

function getDashboardPanelActionKey(activity, action) {
  const identity = activity?.id
    ? `id:${activity.id}`
    : `activity:${activity?.datasetName ?? ""}:${activity?.timestamp ?? ""}:${activity?.title ?? ""}`;
  return `${action}:${identity}`;
}

function isDashboardActivityMatch(activity, selectedActivity) {
  if (!selectedActivity) return false;
  if (activity.id && selectedActivity.id) return activity.id === selectedActivity.id;
  return (
    activity.datasetName === selectedActivity.datasetName &&
    activity.timestamp === selectedActivity.timestamp &&
    activity.title === selectedActivity.title
  );
}

function isDashboardHistoryActivitySelected(activity) {
  return (
    dashboardHistoryState.isOpen &&
    isDashboardActivityMatch(activity, dashboardHistoryState.activity)
  );
}

function isDashboardReportActivitySelected(activity, reportType = null) {
  return (
    dashboardReportPanelState.isOpen &&
    (reportType === null || dashboardReportPanelState.reportType === reportType) &&
    isDashboardActivityMatch(activity, dashboardReportPanelState.activity)
  );
}

function createDashboardReportButton(activity, reportType) {
  const label = reportType === "ic-enc" ? "IC-ENC" : "Validation";
  const reports = getDashboardActivityReports(activity, reportType);
  const canOpen =
    Boolean(normalizeDashboardDatasetName(activity.datasetName)) ||
    reports.some((report) => report?.url);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-link-button";
  button.disabled = !canOpen;
  button.textContent = reports.length > 1 ? `${label} (${reports.length})` : label;
  button.dataset.dashboardPanelAction = getDashboardPanelActionKey(activity, reportType);
  button.classList.toggle("is-active", isDashboardReportActivitySelected(activity, reportType));
  button.setAttribute(
    "aria-pressed",
    String(isDashboardReportActivitySelected(activity, reportType))
  );
  button.setAttribute(
    "aria-label",
    canOpen
      ? `${isDashboardReportActivitySelected(activity, reportType) ? "Close" : "Open"} ${label} reports for ${activity.datasetName || "this activity"}`
      : `${label} reports are not available for this activity`
  );
  if (canOpen) {
    button.addEventListener("click", () => {
      void openDashboardReports(activity, reportType);
    });
  }
  return button;
}

function getDashboardActivityReports(activity, reportType) {
  const reports =
    reportType === "ic-enc"
      ? activity?.links?.icEncReports
      : activity?.links?.internalValidationReports;
  return Array.isArray(reports) ? reports : [];
}

function ensureDashboardHistoryKeyboardHandlers() {
  if (dashboardHistoryKeyboardHandlersRegistered) {
    return;
  }

  dashboardHistoryKeyboardHandlersRegistered = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    // Explicit metric help and the open dropdown own Escape before the detail panel does.
    if (
      event.composedPath?.().some((node) => node?.tagName?.toLowerCase() === "calcite-dropdown")
    ) {
      return;
    }
    if (dashboardReportPanelState.isOpen) {
      closeDashboardReports();
    } else if (dashboardHistoryState.isOpen) {
      closeDashboardHistory();
    }
  });
}

function ensureDashboardHistoryLookupsLoaded() {
  if (dashboardHistoryLookupLoadPromise) {
    return dashboardHistoryLookupLoadPromise;
  }

  const request = loadStatuses();
  dashboardHistoryLookupLoadPromise = request;
  void request.catch(() => {
    if (dashboardHistoryLookupLoadPromise === request) {
      dashboardHistoryLookupLoadPromise = null;
    }
  });
  return request;
}

function createDashboardHistoryState() {
  return {
    isOpen: false,
    datasetName: null,
    activity: null,
    history: null,
    loading: false,
    error: null,
    requestId: 0,
  };
}

async function openDashboardHistory(activityOrDatasetName) {
  const normalizedDatasetName = normalizeDashboardDatasetName(
    typeof activityOrDatasetName === "string"
      ? activityOrDatasetName
      : activityOrDatasetName?.datasetName
  );

  if (!normalizedDatasetName) {
    noticeError(
      "History could not be opened",
      "The selected activity does not have a product name.",
      {
        storeInCenter: false,
        countAsUnread: false,
      }
    );
    return;
  }

  const activity =
    typeof activityOrDatasetName === "string"
      ? null
      : createDashboardHistoryActivitySnapshot(activityOrDatasetName, normalizedDatasetName);

  if (
    dashboardHistoryState.isOpen &&
    (activity
      ? isDashboardActivityMatch(activity, dashboardHistoryState.activity)
      : dashboardHistoryState.datasetName === normalizedDatasetName)
  ) {
    closeDashboardHistory();
    return;
  }

  resetDashboardReports();
  const requestId = dashboardHistoryState.requestId + 1;
  dashboardHistoryState = {
    isOpen: true,
    datasetName: normalizedDatasetName,
    activity,
    history: null,
    loading: true,
    error: null,
    requestId,
  };
  rerenderDashboardPage();

  try {
    await ensureDashboardHistoryLookupsLoaded();
    if (dashboardHistoryState.requestId !== requestId) {
      return;
    }

    const history = await fetchProductHistory(normalizedDatasetName);

    if (dashboardHistoryState.requestId !== requestId) {
      return;
    }

    dashboardHistoryState = {
      ...dashboardHistoryState,
      history,
      loading: false,
      error: null,
    };
    rerenderDashboardPage();
  } catch (error) {
    if (dashboardHistoryState.requestId !== requestId) {
      return;
    }

    dashboardHistoryState = {
      ...dashboardHistoryState,
      history: null,
      loading: false,
      error,
    };
    rerenderDashboardPage();
    noticeError("History failed to load", getDashboardHistoryErrorMessage(error), {
      storeInCenter: false,
      countAsUnread: false,
    });
  }
}

function closeDashboardHistory() {
  const focusState = dashboardHistoryState.activity
    ? { panelAction: getDashboardPanelActionKey(dashboardHistoryState.activity, "history") }
    : null;
  dashboardHistoryState = {
    ...createDashboardHistoryState(),
    requestId: dashboardHistoryState.requestId + 1,
  };
  rerenderDashboardPage(focusState);
}

function createDashboardHistoryPanel() {
  const section = document.createElement("section");
  section.className = "pc-dashboard-panel pc-dashboard-history-panel";
  section.setAttribute("aria-label", "Product history");

  const header = document.createElement("header");
  header.className = "pc-dashboard-history-panel__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "pc-dashboard-history-panel__title-wrap";

  const eyebrow = document.createElement("div");
  eyebrow.className = "pc-dashboard-history-panel__eyebrow";
  eyebrow.textContent = "Product history";

  const title = document.createElement("h2");
  title.className = "pc-dashboard-history-panel__title";
  title.textContent = dashboardHistoryState.datasetName ?? "No product selected";

  const subTitle = document.createElement("div");
  subTitle.className = "pc-dashboard-history-panel__subtitle";
  subTitle.textContent = dashboardHistoryState.loading
    ? "Loading selected product history..."
    : "Activity context and product timeline";

  titleWrap.append(eyebrow, title, subTitle);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pc-dashboard-history-panel__close";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", "Close product history");
  closeButton.title = "Close History (Esc)";
  closeButton.addEventListener("click", closeDashboardHistory);

  header.append(titleWrap, closeButton);

  const content = document.createElement("div");
  content.className = "pc-dashboard-history-panel__content";
  content.appendChild(createDashboardHistoryPanelContent());

  section.append(header, content);
  return section;
}

function createDashboardHistoryPanelContent() {
  const fragment = document.createDocumentFragment();

  if (dashboardHistoryState.activity) {
    fragment.appendChild(createDashboardHistoryActivityContext(dashboardHistoryState.activity));
  }

  if (dashboardHistoryState.loading) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "Loading history...",
        message: "Checking whether historical changes are available for this product.",
      })
    );
    return fragment;
  }

  if (dashboardHistoryState.error) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "History could not be loaded",
        message: getDashboardHistoryErrorMessage(dashboardHistoryState.error),
      })
    );
    return fragment;
  }

  const history = dashboardHistoryState.history;

  if (!history) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "No history loaded",
        message: "Select History on an activity to inspect product history.",
      })
    );
    return fragment;
  }

  if (!history.events.length) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: history.endpointAvailable
          ? "No historical changes found"
          : "Historical changes are not available yet",
        message: history.endpointAvailable
          ? "No history events were returned for this product."
          : "The history UI is ready, but the backend endpoint has not been implemented yet.",
      })
    );
    return fragment;
  }

  if (history.isDemo) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "Demo history",
        message:
          "This product history is generated in the frontend until the backend endpoint is available.",
      })
    );
  }

  for (const warning of history.warnings) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "History note",
        message: warning,
      })
    );
  }

  fragment.appendChild(createProductHistorySummary(history));
  fragment.appendChild(createProductHistoryEventList(history.events));
  return fragment;
}

function createDashboardHistoryActivitySnapshot(activity, datasetName) {
  return {
    id: activity?.id ?? null,
    datasetName,
    timestamp: activity?.timestamp ?? null,
    title: activity?.title ?? "Activity",
    description: activity?.description ?? "",
    status: activity?.status ?? "unknown",
    severity: activity?.severity ?? "info",
    type: activity?.type ?? "status",
    actor: activity?.actor ?? "",
  };
}

function createDashboardHistoryActivityContext(activity) {
  const context = document.createElement("section");
  context.className = "pc-dashboard-history-context";
  context.setAttribute("aria-label", "Selected dashboard activity");

  const header = document.createElement("div");
  header.className = "pc-dashboard-history-context__header";

  const label = document.createElement("div");
  label.className = "pc-dashboard-history-context__label";
  label.textContent = "Selected activity";

  const status = createStatusPill(activity.status, activity.severity);
  status.classList.add("pc-dashboard-history-context__status");

  header.append(label, status);

  const title = document.createElement("div");
  title.className = "pc-dashboard-history-context__title";
  title.textContent = activity.title || "Activity";

  const meta = document.createElement("div");
  meta.className = "pc-dashboard-history-context__meta";
  meta.textContent = createDashboardHistoryActivityMeta(activity);

  if (activity.description) {
    const description = document.createElement("div");
    description.className = "pc-dashboard-history-context__description";
    description.textContent = activity.description;
    context.append(header, title, meta, description);
    return context;
  }

  context.append(header, title, meta);
  return context;
}

function createDashboardHistoryActivityMeta(activity) {
  const items = [];
  const timeZone = lastRenderArgs?.dashboard?.range?.timeZone ?? lastRenderArgs?.range?.timeZone;

  if (activity.timestamp) {
    items.push(formatDashboardRangeDateTime(activity.timestamp, { timeZone }));
  }

  if (activity.type) {
    items.push(toTitleCase(activity.type));
  }

  if (activity.actor) {
    items.push(activity.actor);
  }

  return items.length ? items.join(" \u00b7 ") : "No activity details available";
}

function normalizeDashboardDatasetName(datasetName) {
  const normalizedDatasetName = String(datasetName ?? "").trim();
  return normalizedDatasetName.length > 0 ? normalizedDatasetName : null;
}

function getDashboardHistoryErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown history error.";
}

function createDashboardReportPanelState() {
  return {
    isOpen: false,
    reportType: null,
    datasetName: null,
    activity: null,
    reports: [],
    loading: false,
    error: null,
    hasUnavailableLinks: false,
    hasUnattributedArtifacts: false,
    hasUnknownKinds: false,
    requestId: 0,
  };
}

function resetDashboardReports() {
  // Invalidate pending Product requests when another panel takes ownership.
  dashboardReportPanelState = {
    ...createDashboardReportPanelState(),
    requestId: dashboardReportPanelState.requestId + 1,
  };
  dashboardReportPanelPage = null;
}

async function openDashboardReports(activity, reportType) {
  if (reportType !== "ic-enc" && reportType !== "internal") return;
  const datasetName = normalizeDashboardDatasetName(activity?.datasetName);
  const candidates = getDashboardActivityReports(activity, reportType);
  const linkedReports = candidates.filter((report) => report?.url);
  if (!datasetName && linkedReports.length === 0) return;
  const page = document.getElementById("product-dashboard-page");
  if (!page?.isConnected) return;
  if (
    dashboardReportPanelState.isOpen &&
    dashboardReportPanelPage === page &&
    isDashboardReportActivitySelected(activity, reportType)
  ) {
    // Toggling the selected action closes its panel and invalidates the lookup.
    closeDashboardReports();
    return;
  }

  dashboardHistoryState = {
    ...createDashboardHistoryState(),
    requestId: dashboardHistoryState.requestId + 1,
  };
  const requestId = dashboardReportPanelState.requestId + 1;
  dashboardReportPanelPage = page;
  dashboardReportPanelState = {
    ...createDashboardReportPanelState(),
    requestId,
    isOpen: true,
    datasetName,
    reportType,
    activity: createDashboardHistoryActivitySnapshot(activity, datasetName),
    reports: linkedReports,
    loading: linkedReports.length === 0,
    hasUnavailableLinks: linkedReports.length > 0 && linkedReports.length < candidates.length,
  };
  rerenderDashboardPage();

  // Activity-provided URLs are already authoritative download links. Preserve
  // them and avoid an additional request; otherwise resolve Product-scoped files.
  if (linkedReports.length > 0) return;
  try {
    const result = await fetchDashboardValidationReports(datasetName, { reportType });
    if (dashboardReportPanelState.requestId !== requestId || !page.isConnected) return;
    dashboardReportPanelState = {
      ...dashboardReportPanelState,
      reports: result.reports,
      hasUnattributedArtifacts: result.hasUnattributedArtifacts,
      hasUnknownKinds: result.hasUnknownKinds,
      loading: false,
      error: null,
    };
    rerenderDashboardPage();
  } catch (error) {
    if (dashboardReportPanelState.requestId !== requestId || !page.isConnected) return;
    dashboardReportPanelState = {
      ...dashboardReportPanelState,
      reports: [],
      loading: false,
      error,
    };
    rerenderDashboardPage();
  }
}

function closeDashboardReports() {
  const focusState = dashboardReportPanelState.activity
    ? {
        panelAction: getDashboardPanelActionKey(
          dashboardReportPanelState.activity,
          dashboardReportPanelState.reportType
        ),
      }
    : null;
  resetDashboardReports();
  rerenderDashboardPage(focusState);
}

function createDashboardReportPanel() {
  const isIcEnc = dashboardReportPanelState.reportType === "ic-enc";
  const reportLabel = isIcEnc ? "IC-ENC reports" : "Validation reports";
  const section = document.createElement("section");
  section.className = "pc-dashboard-panel pc-dashboard-history-panel";
  section.setAttribute("aria-label", reportLabel);

  const header = document.createElement("header");
  header.className = "pc-dashboard-history-panel__header";
  const titleWrap = document.createElement("div");
  titleWrap.className = "pc-dashboard-history-panel__title-wrap";
  const eyebrow = document.createElement("div");
  eyebrow.className = "pc-dashboard-history-panel__eyebrow";
  eyebrow.textContent = reportLabel;
  const title = document.createElement("h2");
  title.className = "pc-dashboard-history-panel__title";
  title.textContent = dashboardReportPanelState.datasetName ?? "Selected activity";
  const subTitle = document.createElement("div");
  subTitle.className = "pc-dashboard-history-panel__subtitle";
  subTitle.textContent = dashboardReportPanelState.loading
    ? "Loading available files..."
    : "Available files for the selected Product";
  titleWrap.append(eyebrow, title, subTitle);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pc-dashboard-history-panel__close";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", `Close ${reportLabel}`);
  closeButton.title = `Close ${reportLabel} (Esc)`;
  closeButton.addEventListener("click", closeDashboardReports);
  header.append(titleWrap, closeButton);

  const content = document.createElement("div");
  content.className = "pc-dashboard-history-panel__content";
  content.appendChild(createDashboardReportPanelContent());
  section.append(header, content);
  return section;
}

function createDashboardReportPanelContent() {
  const fragment = document.createDocumentFragment();
  const state = dashboardReportPanelState;
  if (state.activity) {
    fragment.appendChild(createDashboardHistoryActivityContext(state.activity));
  }
  if (state.loading) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "Loading reports...",
        message: "Checking available files for the selected Product.",
      })
    );
    return fragment;
  }
  if (state.error) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "Reports could not be loaded",
        message: state.error instanceof Error ? state.error.message : "Unknown report error.",
      })
    );
    return fragment;
  }
  if (!state.reports.length) {
    fragment.appendChild(
      createProductHistoryStateMessage({
        title: "No reports found",
        message: `No ${state.reportType === "ic-enc" ? "IC-ENC" : "Validation"} reports were found for this Product.`,
      })
    );
  } else {
    const tiles = document.createElement("div");
    tiles.className = "pc-dashboard-report-tiles";
    for (const report of state.reports) {
      tiles.appendChild(createDashboardReportItem(report));
    }
    fragment.appendChild(tiles);
  }
  if (state.hasUnavailableLinks) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "Unavailable links",
        message: "Some activity report links are unavailable.",
      })
    );
  }
  if (state.hasUnattributedArtifacts || state.hasUnknownKinds) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "Excluded files",
        message: "Files without verified ownership or report type were excluded.",
      })
    );
  }
  return fragment;
}

function createDashboardReportItem(report) {
  const item = document.createElement("article");
  item.className = "pc-dashboard-report-tile";
  const title = document.createElement("div");
  title.className = "pc-dashboard-history-context__title";
  title.textContent = report.title || "Report file";
  item.appendChild(title);
  if (report.generatedAt) {
    const meta = document.createElement("div");
    meta.className = "pc-dashboard-history-context__meta";
    meta.textContent = formatDashboardRangeDateTime(report.generatedAt, {
      timeZone: lastRenderArgs?.dashboard?.range?.timeZone,
    });
    item.appendChild(meta);
  }
  const actions = document.createElement("div");
  actions.className = "pc-dashboard-report-tile__actions";
  actions.appendChild(createDashboardReportLink(report, "Download"));
  if (
    dashboardReportPanelState.reportType === "internal" &&
    dashboardReportPanelState.datasetName &&
    /\.vld$/i.test(report.title ?? "")
  ) {
    appendValidationViewerAction(
      actions,
      report.artifact ?? {
        id: report.id,
        fileName: report.title,
        url: report.url,
        createdAtUtc: report.generatedAt,
      },
      dashboardReportPanelState.datasetName
    );
  }
  item.appendChild(actions);
  return item;
}

function createDashboardReportLink(report, label) {
  const link = document.createElement("a");
  link.className = "pc-dashboard-link-button";
  link.href = report.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.title = report.title || label;
  return link;
}

function createDisabledLink(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-link-button";
  button.disabled = true;
  button.textContent = label;
  button.title = `${label} is not available for this activity.`;

  return button;
}

// This reporting section has its own date/Product scope; activity-only filters
// intentionally do not change immutable IC-ENC decisions.
function createDistributionOverview(distribution) {
  const accepted = getRecordedDistributionCount(distribution, "accepted");
  const rejected = getRecordedDistributionCount(distribution, "rejected");
  const decisions = accepted === null || rejected === null ? null : accepted + rejected;
  const rate =
    decisions > 0 ? `${Math.round(((accepted ?? 0) / decisions) * 100)}% distributed` : "";
  const panel = createReportingPanel("IC-ENC distribution", rate, "distribution");
  const totals = document.createElement("div");
  totals.className = "pc-dashboard-reporting-totals";
  for (const [label, value, tone] of [
    ["Sent", getRecordedDistributionCount(distribution, "sent"), "info"],
    ["Distributed", accepted, "positive"],
    ["Rejected", rejected, "danger"],
    ["Pending", getRecordedDistributionCount(distribution, "pending"), "neutral"],
  ]) {
    totals.appendChild(createReportingCounter(label, value, tone));
  }
  panel.appendChild(totals);
  return panel;
}

function createReportingPanel(title, detail, helpKey = null) {
  const panel = document.createElement("section");
  panel.className = "pc-dashboard-panel pc-dashboard-reporting-panel";
  panel.appendChild(createPanelHeader({ title, count: detail, helpKey }));
  return panel;
}

// The default reporting workspace keeps only three primary charts. Secondary
// aggregates share one bounded panel so they cannot crowd the status/operation charts.
function hasAdditionalDashboardInsights(dashboard) {
  return Boolean(
    dashboard.productBreakdown || dashboard.operationalHealth || dashboard.reportSummary
  );
}

function createReportingInsightGroup(title, count, helpKey) {
  const insight = document.createElement("section");
  insight.className = "pc-dashboard-insight";
  insight.appendChild(createPanelHeader({ title, count, headingLevel: "h3", helpKey }));
  return insight;
}

function createAdditionalInsightsOverview(dashboard) {
  const panel = createReportingPanel("Additional insights", "");
  panel.classList.add("pc-dashboard-insights-panel");
  const insights = document.createElement("div");
  insights.className = "pc-dashboard-insights";
  if (dashboard.productBreakdown) {
    insights.appendChild(
      createSpecificationBreakdown(dashboard.productBreakdown, { compact: true })
    );
  }
  if (dashboard.operationalHealth) {
    insights.appendChild(
      createOperationalHealthOverview(dashboard.operationalHealth, { compact: true })
    );
  }
  if (dashboard.reportSummary) {
    insights.appendChild(createReportSummaryOverview(dashboard.reportSummary, { compact: true }));
  }
  panel.appendChild(insights);
  return panel;
}

function createReportingCounter(label, value, tone = "neutral") {
  const counter = document.createElement("div");
  counter.className = `pc-dashboard-reporting-counter is-${tone}`;
  const caption = document.createElement("span");
  caption.className = "pc-dashboard-reporting-counter__label";
  caption.textContent = label;
  const amount = document.createElement("strong");
  amount.className = "pc-dashboard-reporting-counter__value";
  amount.textContent = value === null || value === undefined ? "—" : String(value);
  counter.append(caption, amount);
  return counter;
}

function createActivityTrendPanel(rows, distributionTrend = []) {
  const total = rows.reduce((count, row) => count + row.activities, 0);
  const panel = createReportingPanel("Activity over time", `${total} events`);
  panel.appendChild(
    createDailyBarChart(rows, [
      { key: "activities", label: "Activities", tone: "info" },
      { key: "failed", label: "Failed events", tone: "danger" },
    ])
  );

  // The main activity timeline stays visible. The additional distribution
  // timeline remains available without adding a competing top-level panel.
  if (distributionTrend?.length) {
    const details = document.createElement("details");
    details.className = "pc-dashboard-insights__trend-disclosure";
    details.open = dashboardTrendsExpanded;
    details.addEventListener("toggle", () => {
      if (details.isConnected) dashboardTrendsExpanded = details.open;
    });
    const summary = document.createElement("summary");
    summary.textContent = "Distribution over time";
    details.append(summary, createDistributionTrendPanel(distributionTrend));
    panel.appendChild(details);
  }
  return panel;
}

function createDistributionTrendPanel(rows) {
  const panel = createReportingPanel("Live distribution over time", "Daily outcomes");
  panel.appendChild(
    createDailyBarChart(rows, [
      { key: "sent", label: "Sent", tone: "info" },
      { key: "accepted", label: "Distributed", tone: "positive" },
      { key: "rejected", label: "Rejected", tone: "danger" },
    ])
  );
  return panel;
}

function formatDashboardTrendDay(value, includeYear = false) {
  const day = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const [, year, month, date] = match;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  if (
    utc.getUTCFullYear() !== Number(year) ||
    utc.getUTCMonth() + 1 !== Number(month) ||
    utc.getUTCDate() !== Number(date)
  ) {
    return day;
  }
  return `${date}/${month}${includeYear ? `-${year}` : ""}`;
}

function createDailyBarChart(rows, series) {
  const chart = document.createElement("div");
  chart.className = "pc-dashboard-daily-chart";
  const visible = rows.slice(-14);
  chart.classList.toggle("is-sparse", visible.length > 0 && visible.length <= 3);
  if (!visible.length) {
    chart.appendChild(createEmptyText("No activity for the selected range."));
    return chart;
  }
  const maximum = Math.max(1, ...visible.flatMap((row) => series.map(({ key }) => row[key] ?? 0)));
  const plot = document.createElement("div");
  plot.className = "pc-dashboard-daily-chart__plot";
  plot.setAttribute("role", "img");
  plot.setAttribute(
    "aria-label",
    visible
      .map(
        (row) =>
          `${formatDashboardTrendDay(row.day, true)}: ${series.map(({ key, label }) => `${label} ${row[key] ?? "unavailable"}`).join(", ")}`
      )
      .join("; ")
  );

  for (const row of visible) {
    const day = document.createElement("div");
    day.className = "pc-dashboard-daily-chart__day";
    day.title = `${formatDashboardTrendDay(row.day, true)}: ${series.map(({ key, label }) => `${label} ${row[key] ?? "—"}`).join(", ")}`;
    const bars = document.createElement("div");
    bars.className = "pc-dashboard-daily-chart__bars";
    bars.setAttribute("aria-hidden", "true");
    for (const { key, tone } of series) {
      const bar = document.createElement("span");
      bar.className = `pc-dashboard-daily-chart__bar is-${tone}`;
      const value = row[key] ?? 0;
      bar.style.height = value > 0 ? `${Math.max(3, (value / maximum) * 100)}%` : "0";
      if (visible.length <= 3 && value > 0) {
        bar.setAttribute("data-value", String(value));
      }
      bars.appendChild(bar);
    }
    const label = document.createElement("span");
    label.className = "pc-dashboard-daily-chart__day-label";
    label.textContent = formatDashboardTrendDay(row.day);
    day.append(bars, label);
    plot.appendChild(day);
  }
  chart.appendChild(plot);

  const legend = document.createElement("div");
  legend.className = "pc-dashboard-daily-chart__legend";
  for (const { label, tone } of series) {
    const item = document.createElement("span");
    item.className = `pc-dashboard-daily-chart__legend-item is-${tone}`;
    item.textContent = label;
    legend.appendChild(item);
  }
  chart.appendChild(legend);
  if (rows.length > visible.length) {
    chart.appendChild(
      createReportingNote(`Showing the latest ${visible.length} days with recorded events.`)
    );
  }
  return chart;
}

function formatDashboardSpecification(value) {
  const specification = String(value ?? "");
  const match = /^S(\d{2,3})$/i.exec(specification);
  return match ? `S-${match[1]}` : specification;
}

function createSpecificationBreakdown(rows, { compact = false } = {}) {
  const total = rows.reduce((count, row) => count + row.activities, 0);
  const panel = compact
    ? createReportingInsightGroup("Activity by specification", `${total} events`, "specification")
    : createReportingPanel("Activity by specification", `${total} events`, "specification");
  const list = document.createElement("div");
  list.className = "pc-dashboard-specification-list";
  for (const [index, row] of rows.entries()) {
    const item = document.createElement("div");
    item.className = "pc-dashboard-specification-row";
    const header = document.createElement("div");
    header.className = "pc-dashboard-specification-row__header";
    const name = document.createElement("span");
    name.textContent = formatDashboardSpecification(row.specification);
    const count = document.createElement("strong");
    count.textContent = `${row.activities} events`;
    header.append(name, count);
    const track = document.createElement("div");
    track.className = "pc-dashboard-specification-row__track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = `is-series-${index % 5}`;
    fill.style.width = `${total > 0 ? Math.min(100, (row.activities / total) * 100) : 0}%`;
    track.appendChild(fill);
    const details = document.createElement("span");
    details.className = "pc-dashboard-reporting-note";
    details.textContent = `${row.productsTouched ?? "—"} Products · ${row.failed ?? "—"} failed events`;
    item.append(header, track, details);
    list.appendChild(item);
  }
  if (!rows.length) {
    list.appendChild(createEmptyText("No activity breakdown available."));
  }
  panel.appendChild(list);
  return panel;
}

function createOperationalHealthOverview(health, { compact = false } = {}) {
  const panel = compact
    ? createReportingInsightGroup(
        "Current workflow state",
        `${health.tracks ?? "—"} tracks`,
        "workflow"
      )
    : createReportingPanel("Current workflow state", `${health.tracks ?? "—"} tracks`, "workflow");
  const totals = document.createElement("div");
  totals.className = "pc-dashboard-reporting-totals is-three";
  for (const [label, count, tone] of [
    ["Export / validate", health.processing, "info"],
    ["At IC-ENC", health.awaitingIcEnc, "neutral"],
    ["Paused", health.paused, "neutral"],
  ]) {
    totals.appendChild(createReportingCounter(label, count, tone));
  }
  panel.appendChild(totals);
  return panel;
}

function createReportSummaryOverview(summary, { compact = false } = {}) {
  const panel = compact
    ? createReportingInsightGroup("Stored report files", `${summary.total ?? "—"} files`, "reports")
    : createReportingPanel("Stored report files", `${summary.total ?? "—"} files`, "reports");
  const totals = document.createElement("div");
  totals.className = "pc-dashboard-reporting-totals is-two";
  // Both kinds are validation-related files, not necessarily distinct validation runs.
  const validationKinds = [summary.internalValidation, summary.validationDiagnostics].filter(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
  const validationFiles = validationKinds.length
    ? validationKinds.reduce((sum, value) => sum + value, 0)
    : null;
  for (const [label, count] of [
    ["IC-ENC", summary.icEnc],
    ["Validation files", validationFiles],
  ]) {
    totals.appendChild(createReportingCounter(label, count));
  }
  panel.appendChild(totals);
  return panel;
}

function createReportingNote(message) {
  const note = document.createElement("p");
  note.className = "pc-dashboard-reporting-note";
  note.textContent = message;
  return note;
}

function createSummaryRows({ title, rows, filterKey, filters }) {
  const section = document.createElement("section");
  section.className = "pc-dashboard-panel pc-dashboard-breakdown";
  const isStatus = filterKey === "status";
  section.classList.add(isStatus ? "is-status-overview" : "is-operation-overview");
  section.appendChild(
    createPanelHeader({
      title,
      count: sumSummaryRowCounts(rows),
    })
  );

  const list = document.createElement("div");
  list.className = isStatus
    ? "pc-dashboard-breakdown__rows pc-dashboard-status-legend"
    : "pc-dashboard-breakdown__rows pc-dashboard-operation-chart";
  if (rows.length === 0) {
    list.appendChild(createEmptyText("No summary rows available yet."));
  } else {
    const maxCount = Math.max(1, ...rows.map((row) => Number(row.count) || 0));
    for (const row of rows) {
      list.appendChild(createSummaryRow({ row, filterKey, filters, maxCount }));
    }
  }

  if (isStatus && rows.some((row) => Number(row.count) > 0)) {
    const overview = document.createElement("div");
    overview.className = "pc-dashboard-status-overview";
    overview.append(createDashboardStatusChart(rows), list);
    section.appendChild(overview);
  } else {
    section.appendChild(list);
  }
  return section;
}

function createDashboardStatusChart(rows) {
  const chart = document.createElement("div");
  chart.className = "pc-dashboard-status-chart";
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    `Status distribution: ${rows.map((row) => `${toTitleCase(row.label)} ${row.count}`).join(", ")}`
  );

  const total = sumSummaryRowCounts(rows);
  let position = 0;
  const segments = [];
  for (const row of rows) {
    const count = Number(row.count);
    if (!(count > 0)) continue;
    const end = Math.min(100, position + (count / total) * 100);
    const color = getDashboardChartColor(row.label, "status");
    segments.push(`${color} ${position.toFixed(3)}% ${end.toFixed(3)}%`);
    position = end;
  }
  chart.style.background = `conic-gradient(${segments.join(", ")})`;

  const center = document.createElement("div");
  center.className = "pc-dashboard-status-chart__center";
  center.setAttribute("aria-hidden", "true");
  const number = document.createElement("strong");
  number.className = "pc-dashboard-status-chart__total";
  number.textContent = String(total);
  const label = document.createElement("span");
  label.className = "pc-dashboard-status-chart__caption";
  label.textContent = "Events";
  center.append(number, label);
  chart.appendChild(center);
  return chart;
}

function getDashboardChartTone(value, filterKey) {
  const normalized = String(value).trim().toLowerCase();
  if (filterKey === "type") return getDashboardOperationTone(normalized);
  if (filterKey !== "status") return "neutral";
  if (["failed", "error", "rejected"].includes(normalized)) return "danger";
  if (normalized === "active") return "active";
  if (normalized === "completed") return "positive";
  return "neutral";
}

function getDashboardOperationTone(value) {
  const operation = String(value ?? "")
    .trim()
    .toLowerCase();
  if (operation === "export") return "export";
  if (operation === "validation") return "validation";
  if (operation === "send") return "send";
  if (operation === "change") return "change";
  if (operation === "publication") return "publication";
  if (operation === "error") return "danger";
  return "neutral";
}

function getDashboardChartColor(value, filterKey) {
  const tone = getDashboardChartTone(value, filterKey);
  const colors = {
    active: "var(--calcite-color-info, #007ac2)",
    positive: "var(--calcite-color-status-success, #22804c)",
    danger: "var(--calcite-color-status-danger, #c93232)",
    neutral: "var(--pc-text-muted, #808080)",
  };
  return colors[tone] ?? colors.neutral;
}

function createSummaryRow({ row, filterKey, filters, maxCount }) {
  const isActive = isDashboardSummaryRowFilterActive(filters, {
    filterKey,
    rowValue: row.label,
  });
  const isStatus = filterKey === "status";
  const tone = getDashboardChartTone(row.label, filterKey);
  const item = document.createElement("button");
  item.type = "button";
  item.className = `pc-dashboard-breakdown-row is-actionable is-${tone}`;
  item.classList.toggle("is-active", isActive);
  item.setAttribute("aria-pressed", String(isActive));
  item.title = isActive
    ? `Clear ${toTitleCase(row.label)} filter`
    : `Filter activity by ${toTitleCase(row.label)}`;
  item.addEventListener("click", () => {
    updateDashboardFilters(
      createDashboardSummaryRowFilterPatch(dashboardFilters, {
        filterKey,
        rowValue: row.label,
      })
    );
  });

  const label = document.createElement("span");
  label.className = "pc-dashboard-breakdown-row__label";
  label.textContent = toTitleCase(row.label);

  const values = document.createElement("span");
  values.className = "pc-dashboard-breakdown-row__value";
  values.textContent = row.failed > 0 ? `${row.count} (${row.failed} failed)` : String(row.count);

  if (isStatus) {
    const swatch = document.createElement("span");
    swatch.className = `pc-dashboard-status-legend__swatch is-${tone}`;
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, label, values);
  } else {
    const track = document.createElement("span");
    track.className = "pc-dashboard-breakdown-row__track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = `pc-dashboard-breakdown-row__fill is-${tone}`;
    fill.style.width = `${Math.max(0, Math.min(100, ((Number(row.count) || 0) / maxCount) * 100))}%`;
    track.appendChild(fill);
    item.append(label, track, values);
  }
  return item;
}

function sumSummaryRowCounts(rows) {
  return rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
}

function createPanelHeader({
  title,
  count,
  status = null,
  visuallyHiddenTitle = false,
  headingLevel = "h2",
  helpKey = null,
}) {
  const header = document.createElement("header");
  header.className = "pc-dashboard-panel__header";

  const heading = document.createElement(headingLevel);
  heading.className = "pc-dashboard-panel__title";
  heading.classList.toggle("pc-dashboard-visually-hidden", visuallyHiddenTitle);
  heading.textContent = title;

  const meta = document.createElement("div");
  meta.className = "pc-dashboard-panel__meta";
  meta.textContent = status ? `${status} - ${count}` : String(count);

  header.append(heading, meta);
  if (helpKey) {
    header.classList.add("has-metric-help");
    header.appendChild(createMetricHelpButton(helpKey, title));
  }
  return header;
}

function createMetricHelpButton(key, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-metric-help";
  button.dataset.dashboardFocusKey = `metric-help-${key}`;
  button.setAttribute("aria-label", `About ${label}`);
  // The delegated help owner supplies the overlay without a second native title.
  button.setAttribute("data-app-original-title", DASHBOARD_METRIC_HELP[key]);
  button.setAttribute("data-app-help-on-click", "");
  const icon = document.createElement("calcite-icon");
  icon.icon = "information";
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);
  return button;
}

function createEmptyText(text) {
  const empty = document.createElement("p");
  empty.className = "pc-dashboard-empty";
  empty.textContent = text;

  return empty;
}

function toTitleCase(value) {
  return String(value ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
