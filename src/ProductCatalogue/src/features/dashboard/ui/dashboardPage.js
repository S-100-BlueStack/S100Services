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
  activeOperations: "Active activities across the full filtered result",
  acceptedForDistribution: "Accepted distribution totals are not provided by this Dashboard API",
  failedOperations: "Failed activities in the selected filtered range",
  reportsAvailable: "IC-ENC or validation reports recorded by the Dashboard API",
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

function createSummaryCards(dashboard) {
  const cards = document.createElement("section");
  cards.className = "pc-dashboard-summary";
  cards.setAttribute("aria-label", "Dashboard summary");
  const summary = dashboard?.summary ?? {};
  const statusRows = dashboard?.statusSummary ?? [];
  const hasStatusTotals = statusRows.length > 0 || Number(summary.totalActivities) === 0;
  const activeCount = hasStatusTotals
    ? statusRows.reduce(
        (count, row) =>
          count + (String(row.label).toLowerCase() === "active" ? Number(row.count) || 0 : 0),
        0
      )
    : null;

  const metrics = [
    {
      key: "totalActivities",
      label: "Activities",
      value: summary.totalActivities ?? 0,
      detail: `${summary.importantChanges ?? 0} important changes`,
    },
    {
      key: "productsTouched",
      label: "Products touched",
      value: summary.productsTouched ?? 0,
      detail: "Unique Products",
    },
    {
      key: "activeOperations",
      label: "Active",
      value: activeCount ?? "—",
      detail: activeCount === null ? "Status total unavailable" : "Active status events",
      tone: "active",
    },
    {
      key: "acceptedForDistribution",
      label: "Accepted for distribution",
      // Ready-for-distribution and completed operations do not prove IC-ENC acceptance.
      // This KPI must remain unavailable until the backend provides a verified total.
      value: "—",
      detail: "Backend total not available",
      tone: "positive",
      unavailable: true,
    },
    {
      key: "failedOperations",
      label: "Failed",
      value: summary.failedOperations ?? 0,
      detail: "Failed events",
      tone: "danger",
      interactive: true,
    },
    {
      key: "reportsAvailable",
      label: "Reports",
      value: summary.reportsAvailable ?? 0,
      detail: "Linked reports",
    },
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
      card.title = isFiltered ? "Clear failed activity filter" : "Filter to failed activity";
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

    const detail = document.createElement("div");
    detail.className = "pc-dashboard-summary-card__detail";
    detail.textContent = metric.detail;

    const description = document.createElement("div");
    description.className = "pc-dashboard-visually-hidden";
    description.textContent = DASHBOARD_METRIC_DESCRIPTIONS[metric.key];

    card.append(label, value, detail, description);
    cards.appendChild(card);
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
  aside.append(
    ...(dashboardReportPanelState.isOpen
      ? [createDashboardReportPanel()]
      : dashboardHistoryState.isOpen
        ? [createDashboardHistoryPanel()]
        : [
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
            }),
          ])
  );

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

  for (const label of ["Time", "Product", "Activity", "Status", "Links"]) {
    const th = document.createElement("th");
    th.scope = "col";
    const sortKey = label.toLowerCase();
    if (label === "Links") {
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
  const links = document.createElement("div");
  links.className = "pc-dashboard-activity-links";

  links.append(
    createProductLink({
      label: "Review",
      enabled: activity.links.review && activity.datasetName,
      url: activity.datasetName ? buildReviewUrl([activity.datasetName]) : null,
    }),
    createProductLink({
      label: "Analyze",
      enabled: activity.links.analyze && activity.datasetName,
      url: activity.datasetName ? buildAnalyzeUrl([activity.datasetName]) : null,
    }),
    createDashboardHistoryLink(activity),
    createDashboardReportButton(activity, "ic-enc"),
    createDashboardReportButton(activity, "internal")
  );

  return links;
}

function createProductLink({ label, enabled, url }) {
  if (!enabled || !url) {
    return createDisabledLink(label);
  }

  const link = document.createElement("a");
  link.className = "pc-dashboard-link-button";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;

  return link;
}

function createDashboardHistoryLink(activity) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-dashboard-link-button";
  button.disabled = !activity.links.history || !activity.datasetName;
  button.textContent = "History";
  button.dataset.dashboardPanelAction = getDashboardPanelActionKey(activity, "history");
  button.classList.toggle("is-active", isDashboardHistoryActivitySelected(activity));
  button.setAttribute(
    "aria-pressed",
    isDashboardHistoryActivitySelected(activity) ? "true" : "false"
  );
  button.title = button.disabled
    ? "History is not available for this activity."
    : isDashboardHistoryActivitySelected(activity)
      ? `Close History for ${activity.datasetName}`
      : `Open History for ${activity.datasetName}`;

  if (!button.disabled) {
    button.addEventListener("click", () => {
      openDashboardHistory(activity);
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
  button.title = canOpen
    ? `${isDashboardReportActivitySelected(activity, reportType) ? "Close" : "Open"} ${label} reports for ${activity.datasetName || "this activity"}`
    : `${label} reports are not available for this activity.`;
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
    if (event.key !== "Escape") return;
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
    for (const report of state.reports) {
      fragment.appendChild(createDashboardReportItem(report));
    }
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
  item.className = "pc-dashboard-history-context";
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
  item.appendChild(createDashboardReportLink(report, "Download"));
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
  chart.title = rows.map((row) => `${toTitleCase(row.label)}: ${row.count}`).join(" | ");

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
  const operation = String(value ?? "").trim().toLowerCase();
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
    fill.style.height = `${Math.max(0, Math.min(100, ((Number(row.count) || 0) / maxCount) * 100))}%`;
    track.appendChild(fill);
    item.append(values, track, label);
  }
  return item;
}

function sumSummaryRowCounts(rows) {
  return rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
}

function createPanelHeader({ title, count, status = null, visuallyHiddenTitle = false }) {
  const header = document.createElement("header");
  header.className = "pc-dashboard-panel__header";

  const heading = document.createElement("h2");
  heading.className = "pc-dashboard-panel__title";
  heading.classList.toggle("pc-dashboard-visually-hidden", visuallyHiddenTitle);
  heading.textContent = title;

  const meta = document.createElement("div");
  meta.className = "pc-dashboard-panel__meta";
  meta.textContent = status ? `${status} - ${count}` : String(count);

  header.append(heading, meta);
  return header;
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
