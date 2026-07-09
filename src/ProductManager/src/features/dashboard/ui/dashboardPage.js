import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import {
  buildDashboardFilterOptions,
  createDashboardSummaryRowFilterPatch,
  createDefaultDashboardFilters,
  createFilteredDashboardView,
  hasActiveDashboardFilters,
  isDashboardSummaryRowFilterActive,
  normalizeDashboardFilters,
} from "../domain/dashboardFilters.js";
import {
  DASHBOARD_RANGE_PRESETS,
  createDashboardRange,
  formatDashboardDateTimeInputValue,
  formatDashboardRangeDateTime,
} from "../domain/dashboardRange.js";

const SUMMARY_CARDS = [
  {
    key: "totalActivities",
    label: "Activities",
    description: "All recorded operational events",
  },
  {
    key: "productsTouched",
    label: "Products touched",
    description: "Unique products with activity",
  },
  {
    key: "importantChanges",
    label: "Important changes",
    description: "Failed or important events",
  },
  {
    key: "reportsAvailable",
    label: "Reports",
    description: "IC-ENC or validation reports",
  },
  {
    key: "failedOperations",
    label: "Failed",
    description: "Operations needing attention",
  },
];

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
let lastRenderArgs = null;

export function renderDashboardPage({ range, dashboard, loading = false, error = null }) {
  lastRenderArgs = { range, dashboard, loading, error };

  const page = getOrCreateDashboardPage();

  page.replaceChildren(
    createHeader({ range, dashboard, loading }),
    createBody({ range, dashboard, loading, error })
  );
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
  page.className = "pm-dashboard-page";
  page.setAttribute("aria-label", "Dashboard");
  shell.appendChild(page);

  return page;
}

function createHeader({ range, dashboard, loading }) {
  const header = document.createElement("header");
  header.className = "pm-dashboard-header";

  const text = document.createElement("div");
  text.className = "pm-dashboard-header__text";

  const eyebrow = document.createElement("div");
  eyebrow.className = "pm-dashboard-header__eyebrow";
  eyebrow.textContent = "Operational overview";

  const title = document.createElement("h1");
  title.className = "pm-dashboard-header__title";
  title.textContent = "Dashboard";

  const meta = document.createElement("p");
  meta.className = "pm-dashboard-header__meta";
  meta.textContent = createHeaderMeta(range, dashboard);

  text.append(eyebrow, title, meta);

  const actions = document.createElement("div");
  actions.className = "pm-dashboard-header__actions";
  actions.append(createRefreshButton(loading), createRangeApplyButton(), createRangeControls(range));

  header.append(text, actions);
  return header;
}

function createHeaderMeta(range, dashboard) {
  const displayRange = dashboard?.range ?? range;
  return displayRange.displayLabel;
}

function createRangeControls(range) {
  const wrapper = document.createElement("div");
  wrapper.className = "pm-dashboard-range-builder";
  wrapper.setAttribute("aria-label", "Dashboard range");

  dashboardRangeDraft ??= createDashboardRangeDraftFromRange(range);

  wrapper.append(
    createQuickRangeButton({
      label: "Since yesterday",
      description: "Fill From with yesterday at 00:00 and leave To open-ended.",
      preset: DASHBOARD_RANGE_PRESETS.sinceYesterday,
    }),
    createQuickRangeButton({
      label: "Last 7 days",
      description: "Fill From with seven calendar days ago at 00:00 and leave To open-ended.",
      preset: DASHBOARD_RANGE_PRESETS.last7Days,
    }),
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

  return wrapper;
}

function createQuickRangeButton({ label, description, preset }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-range-action";
  button.textContent = label;
  button.title = description;
  button.addEventListener("click", () => {
    dashboardRangeDraft = createDashboardRangeDraftFromRange(createDashboardRange(preset));
    updateDashboardRangeInputsFromDraft();
    updateDashboardRangeApplyButtons();
  });

  return button;
}

function createRangeDateTimeField({
  idPrefix,
  label,
  dateKey,
  timeKey,
  defaultTime,
  required,
}) {
  const field = document.createElement("div");
  field.className = "pm-dashboard-range-field";

  const labelElement = document.createElement("span");
  labelElement.className = "pm-dashboard-range-field__label";
  labelElement.textContent = label;

  const datePicker = createRangeDatePicker({
    id: `${idPrefix}-date`,
    label,
    dateKey,
    timeKey,
    defaultTime,
    required,
  });

  const timeInput = document.createElement("input");
  timeInput.id = `${idPrefix}-time`;
  timeInput.className = "pm-dashboard-range-field__input pm-dashboard-range-field__input--time";
  timeInput.type = "time";
  timeInput.step = "60";
  timeInput.value = dashboardRangeDraft?.[timeKey] ?? "";
  timeInput.setAttribute("aria-label", `${label} time`);
  enableNativePickerOnFocus(timeInput);

  datePicker.onDateChange = (dateValue) => {
    if (dateValue && !timeInput.value) {
      timeInput.value = defaultTime;
    }

    if (!dateValue && !required) {
      timeInput.value = "";
    }

    syncRangeDateTimeDraft({ dateKey, timeKey, dateValue, timeValue: timeInput.value });
    updateDashboardRangeApplyButtons();
  };

  timeInput.addEventListener("input", () => {
    syncRangeDateTimeDraft({
      dateKey,
      timeKey,
      dateValue: getDashboardDateButtonValue(datePicker.button),
      timeValue: timeInput.value,
    });
    updateDashboardRangeApplyButtons();
  });

  field.append(labelElement, datePicker.root, timeInput);
  return field;
}

function createRangeDatePicker({ id, label, dateKey, timeKey, defaultTime, required }) {
  ensureDashboardDatePickerDismissHandlers();

  const root = document.createElement("div");
  root.className = "pm-dashboard-date-picker";

  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.className = "pm-dashboard-range-field__input pm-dashboard-range-field__input--date pm-dashboard-range-date-button";
  button.setAttribute("aria-label", `${label} date`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  setDashboardDateButtonValue(button, dashboardRangeDraft?.[dateKey] ?? "");

  const panel = document.createElement("div");
  panel.className = "pm-dashboard-date-picker__panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `${label} date picker`);

  const result = {
    root,
    button,
    onDateChange: null,
  };

  root.dataset.viewDate = getDashboardDateButtonValue(button) || getTodayDateValue();

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDashboardDatePicker({ root, button, panel, onSelect: (nextDate) => {
      setDashboardDateButtonValue(button, nextDate);
      closeDashboardDatePickers();
      result.onDateChange?.(nextDate);
    } });
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  panel.addEventListener("wheel", (event) => {
    event.preventDefault();
    shiftDashboardDatePickerMonth({ root, panel, delta: event.deltaY > 0 ? 1 : -1, onSelect: (nextDate) => {
      setDashboardDateButtonValue(button, nextDate);
      closeDashboardDatePickers();
      result.onDateChange?.(nextDate);
    } });
  }, { passive: false });

  root.append(button, panel);

  if (!required) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "pm-dashboard-range-date-clear";
    clearButton.textContent = "Clear";
    clearButton.title = `Clear ${label} date`;
    clearButton.setAttribute("aria-label", `Clear ${label} date`);
    clearButton.addEventListener("click", () => {
      setDashboardDateButtonValue(button, "");
      syncRangeDateTimeDraft({
        dateKey,
        timeKey,
        dateValue: "",
        timeValue: "",
      });
      setDashboardRangeInputValue("dashboard-range-to-time", "");
      updateDashboardRangeApplyButtons();
    });
    root.appendChild(clearButton);
  }

  renderDashboardDatePickerPanel({ root, panel, onSelect: (nextDate) => {
    setDashboardDateButtonValue(button, nextDate);
    closeDashboardDatePickers();
    result.onDateChange?.(nextDate);
  } });

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

function toggleDashboardDatePicker({ root, button, panel, onSelect }) {
  const willOpen = panel.hidden;
  closeDashboardDatePickers(root);

  if (!willOpen) {
    closeDashboardDatePicker(root);
    return;
  }

  root.dataset.viewDate = getDashboardDateButtonValue(button) || root.dataset.viewDate || getTodayDateValue();
  renderDashboardDatePickerPanel({ root, panel, onSelect });

  root.classList.add("is-open");
  panel.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function closeDashboardDatePickers(exceptRoot = null) {
  document.querySelectorAll(".pm-dashboard-date-picker.is-open").forEach((root) => {
    if (root !== exceptRoot) {
      closeDashboardDatePicker(root);
    }
  });
}

function closeDashboardDatePicker(root) {
  const panel = root.querySelector(".pm-dashboard-date-picker__panel");
  const button = root.querySelector(".pm-dashboard-range-date-button");

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

function renderDashboardDatePickerPanel({ root, panel, onSelect }) {
  const view = parseDashboardDateValue(root.dataset.viewDate) ?? parseDashboardDateValue(getTodayDateValue());
  const selectedDate = getDashboardDateButtonValue(root.querySelector(".pm-dashboard-range-date-button"));
  const firstDay = new Date(view.year, view.month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const previousMonthDays = new Date(view.year, view.month - 1, 0).getDate();

  panel.replaceChildren();

  const header = document.createElement("div");
  header.className = "pm-dashboard-date-picker__header";

  const previousButton = createDashboardDatePickerNavButton("Previous month", "‹");
  previousButton.addEventListener("click", () => {
    shiftDashboardDatePickerMonth({ root, panel, delta: -1, onSelect });
  });

  const title = document.createElement("div");
  title.className = "pm-dashboard-date-picker__title";
  title.textContent = formatDashboardCalendarMonthTitle(view);

  const nextButton = createDashboardDatePickerNavButton("Next month", "›");
  nextButton.addEventListener("click", () => {
    shiftDashboardDatePickerMonth({ root, panel, delta: 1, onSelect });
  });

  header.append(previousButton, title, nextButton);

  const weekdays = document.createElement("div");
  weekdays.className = "pm-dashboard-date-picker__weekdays";

  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((weekday) => {
    const weekdayElement = document.createElement("span");
    weekdayElement.textContent = weekday;
    weekdays.appendChild(weekdayElement);
  });

  const days = document.createElement("div");
  days.className = "pm-dashboard-date-picker__days";

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
    dayButton.className = "pm-dashboard-date-picker__day";
    dayButton.textContent = String(day);
    dayButton.dataset.dateValue = dateValue;
    dayButton.classList.toggle("is-outside-month", isOutsideMonth);
    dayButton.classList.toggle("is-selected", dateValue === selectedDate);
    dayButton.classList.toggle("is-today", dateValue === getTodayDateValue());
    dayButton.addEventListener("click", () => {
      root.dataset.viewDate = dateValue;
      onSelect(dateValue);
    });
    days.appendChild(dayButton);
  }

  panel.append(header, weekdays, days);
}

function createDashboardDatePickerNavButton(label, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-date-picker__nav";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  return button;
}

function shiftDashboardDatePickerMonth({ root, panel, delta, onSelect }) {
  const view = parseDashboardDateValue(root.dataset.viewDate) ?? parseDashboardDateValue(getTodayDateValue());
  const shiftedView = shiftDashboardMonth(view.year, view.month, delta);
  root.dataset.viewDate = formatDashboardDateValue({ ...shiftedView, day: 1 });
  renderDashboardDatePickerPanel({ root, panel, onSelect });
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
  button.textContent = normalizedValue ? formatDashboardDateButtonText(normalizedValue) : "dd-mm-yyyy";
  button.classList.toggle("is-empty", !normalizedValue);

  const root = button.closest(".pm-dashboard-date-picker");
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

function createRangeApplyButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-range-apply";
  button.textContent = "Apply";
  button.disabled = !isDashboardRangeDraftValid(dashboardRangeDraft);
  button.title = button.disabled
    ? "Select From, and keep To after From when used."
    : "Load dashboard activity for the selected range.";
  button.addEventListener("click", () => {
    if (!isDashboardRangeDraftValid(dashboardRangeDraft)) {
      return;
    }

    const fromValue = buildDashboardRangeDraftDateTimeValue({
      date: dashboardRangeDraft.fromDate,
      time: dashboardRangeDraft.fromTime,
      defaultTime: "00:00",
    });
    const toValue = buildDashboardRangeDraftDateTimeValue({
      date: dashboardRangeDraft.toDate,
      time: dashboardRangeDraft.toTime,
      defaultTime: "23:59",
    });

    document.dispatchEvent(
      new CustomEvent("pm-dashboard-range-change", {
        detail: {
          preset: DASHBOARD_RANGE_PRESETS.custom,
          from: fromValue,
          to: toValue,
        },
      })
    );
  });

  return button;
}

function createDashboardRangeDraftFromRange(range) {
  const fromParts = splitDashboardRangeInputValue(
    range.fromQueryValue
      ? normalizeRangeInputValueForDraft(range.fromQueryValue, "00:00")
      : formatDashboardDateTimeInputValue(range.from, { timeZone: range.timeZone })
  );
  const toParts = splitDashboardRangeInputValue(
    range.toQueryValue ? normalizeRangeInputValueForDraft(range.toQueryValue, "23:59") : ""
  );

  return {
    fromDate: fromParts.date,
    fromTime: fromParts.time,
    toDate: toParts.date,
    toTime: toParts.time,
  };
}

function normalizeRangeInputValueForDraft(value, defaultTime) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return `${normalizedValue}T${defaultTime}`;
  }

  return normalizedValue;
}

function splitDashboardRangeInputValue(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return { date: "", time: "" };
  }

  const [datePart, timePart = ""] = normalizedValue.split("T");
  return {
    date: datePart,
    time: timePart.slice(0, 5),
  };
}

function createEmptyDashboardRangeDraft() {
  return {
    fromDate: "",
    fromTime: "",
    toDate: "",
    toTime: "",
  };
}

function isDashboardRangeDraftValid(draft) {
  if (!draft?.fromDate) {
    return false;
  }

  if (!draft.toDate) {
    return !draft.toTime;
  }

  const fromValue = buildDashboardRangeDraftDateTimeValue({
    date: draft.fromDate,
    time: draft.fromTime,
    defaultTime: "00:00",
  });
  const toValue = buildDashboardRangeDraftDateTimeValue({
    date: draft.toDate,
    time: draft.toTime,
    defaultTime: "23:59",
  });

  return Boolean(fromValue && toValue && fromValue <= toValue);
}

function buildDashboardRangeDraftDateTimeValue({ date, time, defaultTime }) {
  if (!date) {
    return null;
  }

  return `${date}T${time || defaultTime}`;
}

function updateDashboardRangeInputsFromDraft() {
  setDashboardRangeInputValue("dashboard-range-from-date", dashboardRangeDraft?.fromDate ?? "");
  setDashboardRangeInputValue("dashboard-range-from-time", dashboardRangeDraft?.fromTime ?? "");
  setDashboardRangeInputValue("dashboard-range-to-date", dashboardRangeDraft?.toDate ?? "");
  setDashboardRangeInputValue("dashboard-range-to-time", dashboardRangeDraft?.toTime ?? "");
}

function setDashboardRangeInputValue(id, value) {
  const element = document.getElementById(id);

  if (element instanceof HTMLInputElement) {
    element.value = value;
    return;
  }

  if (element instanceof HTMLButtonElement && element.classList.contains("pm-dashboard-range-date-button")) {
    setDashboardDateButtonValue(element, value);
  }
}

function updateDashboardRangeApplyButtons() {
  const isValid = isDashboardRangeDraftValid(dashboardRangeDraft);
  const title = isValid
    ? "Load dashboard activity for the selected range."
    : "Select From, and keep To after From when used.";

  document.querySelectorAll(".pm-dashboard-range-apply").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = !isValid;
    button.title = title;
  });
}

function enableNativePickerOnFocus(input) {
  input.addEventListener("focus", () => {
    if (typeof input.showPicker !== "function") {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // Browsers may reject showPicker outside direct user interaction; the native input remains usable.
    }
  });
}

function captureDashboardControlFocus() {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLSelectElement)) {
    return null;
  }

  const filterKey = activeElement.dataset.dashboardFilterKey;
  const rangeInputId = activeElement.id?.startsWith("dashboard-range-")
    ? activeElement.id
    : null;

  if (!filterKey && !rangeInputId) {
    return null;
  }

  return {
    filterKey,
    rangeInputId,
    selectionStart: activeElement instanceof HTMLInputElement ? activeElement.selectionStart : null,
    selectionEnd: activeElement instanceof HTMLInputElement ? activeElement.selectionEnd : null,
  };
}

function restoreDashboardControlFocus(focusState) {
  if (!focusState) {
    return;
  }

  const selector = focusState.rangeInputId
    ? `#${CSS.escape(focusState.rangeInputId)}`
    : `[data-dashboard-filter-key="${focusState.filterKey}"]`;
  const nextElement = document.querySelector(selector);

  if (!(nextElement instanceof HTMLInputElement || nextElement instanceof HTMLSelectElement)) {
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

function createRefreshButton(loading) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-refresh-button";
  button.disabled = loading;
  button.textContent = loading ? "Loading..." : "Refresh";
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("pm-dashboard-refresh"));
  });

  return button;
}

function createBody({ range, dashboard, loading, error }) {
  const body = document.createElement("section");
  body.className = "pm-dashboard-body";

  if (dashboard?.isDemo) {
    body.appendChild(createDemoBanner(dashboard));
  }

  if (error) {
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

  const filterOptions = buildDashboardFilterOptions(dashboard.activities);
  dashboardFilters = normalizeDashboardFilters(dashboardFilters, filterOptions);
  const filteredDashboard = createFilteredDashboardView(dashboard, dashboardFilters);

  body.append(
    createSummaryCards(filteredDashboard.summary),
    createDashboardGrid({
      dashboard: filteredDashboard,
      sourceActivityCount: dashboard.activities.length,
      loading,
      filters: dashboardFilters,
      filterOptions,
    })
  );

  return body;
}

function createDemoBanner(dashboard) {
  const banner = document.createElement("section");
  banner.className = "pm-dashboard-demo-banner";
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

function createStateMessage(title, description) {
  const state = document.createElement("section");
  state.className = "pm-dashboard-state";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = description;

  state.append(heading, text);
  return state;
}

function createSummaryCards(summary) {
  const cards = document.createElement("section");
  cards.className = "pm-dashboard-summary";
  cards.setAttribute("aria-label", "Dashboard summary");

  for (const cardConfig of SUMMARY_CARDS) {
    const card = document.createElement("article");
    card.className = `pm-dashboard-summary-card pm-dashboard-summary-card--${cardConfig.key}`;

    const value = document.createElement("div");
    value.className = "pm-dashboard-summary-card__value";
    value.textContent = String(summary?.[cardConfig.key] ?? 0);

    const label = document.createElement("div");
    label.className = "pm-dashboard-summary-card__label";
    label.textContent = cardConfig.label;

    const description = document.createElement("div");
    description.className = "pm-dashboard-summary-card__description";
    description.textContent = cardConfig.description;

    card.append(value, label, description);
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
}) {
  const grid = document.createElement("section");
  grid.className = "pm-dashboard-grid";

  const timeZone = dashboard.range?.timeZone;

  const main = document.createElement("div");
  main.className = "pm-dashboard-grid__main";
  main.appendChild(
    createActivityList(dashboard.activities, loading, timeZone, {
      filters,
      filterOptions,
      sourceActivityCount,
    })
  );

  const aside = document.createElement("aside");
  aside.className = "pm-dashboard-grid__aside";
  aside.append(
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

  grid.append(main, aside);
  return grid;
}

function createActivityList(
  activities,
  loading,
  timeZone,
  { filters, filterOptions, sourceActivityCount }
) {
  const section = document.createElement("section");
  section.className = "pm-dashboard-panel pm-dashboard-activity";

  const hasFilters = hasActiveDashboardFilters(filters);
  const header = createPanelHeader({
    title: "Activity list",
    count: hasFilters ? `${activities.length} / ${sourceActivityCount}` : activities.length,
    status: loading ? "Refreshing" : null,
  });

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "pm-dashboard-activity__table-wrapper";

  if (activities.length === 0) {
    const emptyText = hasFilters
      ? "No activity matches the selected filters."
      : "No activity found for the selected range.";
    tableWrapper.appendChild(createEmptyText(emptyText));
  } else {
    tableWrapper.appendChild(createActivityTable(activities, timeZone));
  }

  section.append(
    header,
    createActivityFilterBar({ filters, filterOptions, hasFilters }),
    tableWrapper
  );
  return section;
}

function createActivityFilterBar({ filters, filterOptions, hasFilters }) {
  const form = document.createElement("form");
  form.className = "pm-dashboard-filters";
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
  input.className = "pm-dashboard-filter__control pm-dashboard-filter__search";
  input.type = "search";
  input.value = value;
  input.placeholder = "Search activity...";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dataset.dashboardFilterKey = "search";
  input.setAttribute("aria-label", "Search dashboard activity");
  input.addEventListener("input", () => updateDashboardFilters({ search: input.value }));

  wrapper.appendChild(input);
  return wrapper;
}

function createSelectFilter({ key, label, value, options }) {
  const wrapper = createFilterWrapper(label);
  const select = document.createElement("select");
  select.className = "pm-dashboard-filter__control";
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
  wrapper.className = "pm-dashboard-filter";

  const label = document.createElement("span");
  label.className = "pm-dashboard-filter__label";
  label.textContent = labelText;

  wrapper.appendChild(label);
  return wrapper;
}

function createClearFiltersButton(hasFilters) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-filter-clear";
  button.textContent = "Clear filters";
  button.disabled = !hasFilters;
  button.addEventListener("click", () => {
    dashboardFilters = createDefaultDashboardFilters();
    rerenderDashboardPage();
  });

  return button;
}

function updateDashboardFilters(partialFilters) {
  const focusState = captureDashboardControlFocus();
  dashboardFilters = normalizeDashboardFilters({ ...dashboardFilters, ...partialFilters });
  rerenderDashboardPage(focusState);
}

function rerenderDashboardPage(focusState = null) {
  if (!lastRenderArgs) {
    return;
  }

  renderDashboardPage(lastRenderArgs);
  restoreDashboardControlFocus(focusState);
}

function createActivityTable(activities, timeZone) {
  const table = document.createElement("table");
  table.className = "pm-dashboard-activity-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  for (const label of ["Time", "Product", "Activity", "Status", "Links"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
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
  row.className = `pm-dashboard-activity-table__row is-${activity.severity}`;

  const time = document.createElement("td");
  time.className = "pm-dashboard-activity-table__time";
  time.textContent = formatDashboardRangeDateTime(activity.timestamp, { timeZone });

  const product = document.createElement("td");
  product.className = "pm-dashboard-activity-table__product";
  product.textContent = activity.datasetName || "-";
  product.title = activity.datasetName || "";

  const activityCell = document.createElement("td");
  activityCell.className = "pm-dashboard-activity-table__activity";
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
  title.className = "pm-dashboard-activity-table__title";
  title.textContent = activity.title;
  return title;
}

function createActivityDescription(activity) {
  const description = document.createElement("div");
  description.className = "pm-dashboard-activity-table__description";
  description.textContent = activity.description || activity.actor || "-";
  return description;
}

function createActivityDetails(activity) {
  const details = document.createElement("div");
  details.className = "pm-dashboard-activity-table__details";

  if (!activity.details.length) {
    return details;
  }

  for (const item of activity.details) {
    const value = document.createElement("span");
    value.className = "pm-dashboard-detail-chip";
    value.textContent = item.label ? `${item.label}: ${item.value}` : item.value;
    details.appendChild(value);
  }

  return details;
}

function createStatusPill(status, severity) {
  const pill = document.createElement("span");
  pill.className = `pm-dashboard-status-pill is-${status} is-${severity}`;
  pill.textContent = toTitleCase(status);
  return pill;
}

function createActivityLinks(activity) {
  const links = document.createElement("div");
  links.className = "pm-dashboard-activity-links";

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
    createPlaceholderLink({
      label: "History",
      enabled: activity.links.history,
      title: "History is available in Review and the main map quick panel.",
    }),
    createReportLinkGroup({
      label: "IC-ENC",
      reports: activity.links.icEncReports,
    }),
    createReportLinkGroup({
      label: "Validation",
      reports: activity.links.internalValidationReports,
    })
  );

  return links;
}

function createProductLink({ label, enabled, url }) {
  if (!enabled || !url) {
    return createDisabledLink(label);
  }

  const link = document.createElement("a");
  link.className = "pm-dashboard-link-button";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;

  return link;
}

function createPlaceholderLink({ label, enabled, title }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-link-button";
  button.disabled = !enabled;
  button.textContent = label;
  button.title = enabled ? title : `${label} is not available for this activity.`;

  if (enabled) {
    button.addEventListener("click", () => {
      noticeError("Dashboard link is not available", title, {
        dedupeKey: `dashboard-${label.toLowerCase()}-link-placeholder`,
        storeInCenter: false,
        countAsUnread: false,
      });
    });
  }

  return button;
}

function createReportLinkGroup({ label, reports }) {
  const normalizedReports = Array.isArray(reports) ? reports : [];

  if (normalizedReports.length === 0) {
    return createDisabledLink(label);
  }

  const firstReportWithUrl = normalizedReports.find((report) => report.url);
  const linkLabel =
    normalizedReports.length > 1 ? `${label} (${normalizedReports.length})` : label;

  if (firstReportWithUrl?.url) {
    const link = document.createElement("a");
    link.className = "pm-dashboard-link-button";
    link.href = firstReportWithUrl.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = linkLabel;
    link.title = firstReportWithUrl.title || label;
    return link;
  }

  return createPlaceholderLink({
    label: linkLabel,
    enabled: true,
    title: `${label} report metadata is available, but no report URL endpoint exists yet.`,
  });
}

function createDisabledLink(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-link-button";
  button.disabled = true;
  button.textContent = label;
  button.title = `${label} is not available for this activity.`;

  return button;
}

function createSummaryRows({ title, rows, filterKey, filters }) {
  const section = document.createElement("section");
  section.className = "pm-dashboard-panel pm-dashboard-breakdown";
  section.appendChild(
    createPanelHeader({
      title,
      count: sumSummaryRowCounts(rows),
    })
  );

  const list = document.createElement("div");
  list.className = "pm-dashboard-breakdown__rows";

  if (rows.length === 0) {
    list.appendChild(createEmptyText("No summary rows available yet."));
  } else {
    for (const row of rows) {
      list.appendChild(createSummaryRow({ row, filterKey, filters }));
    }
  }

  section.appendChild(list);
  return section;
}

function createSummaryRow({ row, filterKey, filters }) {
  const isActive = isDashboardSummaryRowFilterActive(filters, {
    filterKey,
    rowValue: row.label,
  });
  const item = document.createElement("button");
  item.type = "button";
  item.className = "pm-dashboard-breakdown-row is-actionable";
  item.classList.toggle("is-active", isActive);
  item.setAttribute("aria-pressed", String(isActive));
  item.title = isActive ? `Clear ${toTitleCase(row.label)} filter` : `Filter activity by ${toTitleCase(row.label)}`;
  item.addEventListener("click", () => {
    updateDashboardFilters(
      createDashboardSummaryRowFilterPatch(dashboardFilters, {
        filterKey,
        rowValue: row.label,
      })
    );
  });

  const label = document.createElement("span");
  label.className = "pm-dashboard-breakdown-row__label";
  label.textContent = toTitleCase(row.label);

  const values = document.createElement("span");
  values.className = "pm-dashboard-breakdown-row__value";
  values.textContent = row.failed > 0 ? `${row.count} (${row.failed} failed)` : String(row.count);

  item.append(label, values);
  return item;
}

function sumSummaryRowCounts(rows) {
  return rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
}

function createPanelHeader({ title, count, status = null }) {
  const header = document.createElement("header");
  header.className = "pm-dashboard-panel__header";

  const heading = document.createElement("h2");
  heading.className = "pm-dashboard-panel__title";
  heading.textContent = title;

  const meta = document.createElement("div");
  meta.className = "pm-dashboard-panel__meta";
  meta.textContent = status ? `${status} - ${count}` : String(count);

  header.append(heading, meta);
  return header;
}

function createEmptyText(text) {
  const empty = document.createElement("p");
  empty.className = "pm-dashboard-empty";
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
