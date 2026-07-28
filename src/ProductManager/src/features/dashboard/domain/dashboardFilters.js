import { createDashboardSummaryFromActivities } from "./dashboardSummary.js";

export const DASHBOARD_FILTER_ANY = "all";

export const DASHBOARD_IMPORTANCE_FILTERS = {
  all: DASHBOARD_FILTER_ANY,
  important: "important",
  failed: "failed",
};

export const DASHBOARD_REPORT_FILTERS = {
  all: DASHBOARD_FILTER_ANY,
  any: "any",
  icEnc: "ic-enc",
  internalValidation: "internal-validation",
};

export const DASHBOARD_SUMMARY_FILTER_KEYS = {
  status: "status",
  operation: "type",
};
const FAILED_STATUSES = new Set(["failed", "error", "rejected"]);
const SEARCH_FIELDS_SEPARATOR = " ";

export function createDefaultDashboardFilters() {
  return {
    search: "",
    type: DASHBOARD_FILTER_ANY,
    status: DASHBOARD_FILTER_ANY,
    importance: DASHBOARD_IMPORTANCE_FILTERS.all,
    reports: DASHBOARD_REPORT_FILTERS.all,
    product: DASHBOARD_FILTER_ANY,
  };
}

export function buildDashboardFilterOptions(activities) {
  const normalizedActivities = normalizeActivities(activities);
  return {
    types: buildTokenOptions(normalizedActivities.map((activity) => activity.type)),
    statuses: buildTokenOptions(normalizedActivities.map((activity) => activity.status)),
    products: buildProductOptions(normalizedActivities),
  };
}

export function normalizeDashboardFilters(filters, options = null) {
  const defaults = createDefaultDashboardFilters();
  const source = isPlainObject(filters) ? filters : {};
  const normalized = {
    search: normalizeSearchQuery(source.search),
    type: normalizeTokenFilter(source.type, defaults.type),
    status: normalizeTokenFilter(source.status, defaults.status),
    importance: normalizeTokenFilter(source.importance, defaults.importance),
    reports: normalizeTokenFilter(source.reports, defaults.reports),
    product: normalizeProductFilter(source.product, defaults.product),
  };

  if (!Object.values(DASHBOARD_IMPORTANCE_FILTERS).includes(normalized.importance)) {
    normalized.importance = defaults.importance;
  }

  if (!Object.values(DASHBOARD_REPORT_FILTERS).includes(normalized.reports)) {
    normalized.reports = defaults.reports;
  }

  if (options) {
    normalized.type = keepValidOption(normalized.type, options.types);
    normalized.status = keepValidOption(normalized.status, options.statuses);
    normalized.product = keepValidOption(normalized.product, options.products);
  }

  return normalized;
}

export function hasActiveDashboardFilters(filters) {
  const normalized = normalizeDashboardFilters(filters);
  return (
    Boolean(normalized.search) ||
    normalized.type !== DASHBOARD_FILTER_ANY ||
    normalized.status !== DASHBOARD_FILTER_ANY ||
    normalized.importance !== DASHBOARD_IMPORTANCE_FILTERS.all ||
    normalized.reports !== DASHBOARD_REPORT_FILTERS.all ||
    normalized.product !== DASHBOARD_FILTER_ANY
  );
}

export function filterDashboardActivities(activities, filters) {
  const normalizedActivities = normalizeActivities(activities);
  const normalizedFilters = normalizeDashboardFilters(filters);
  const normalizedSearch = normalizeSearchComparisonText(normalizedFilters.search);

  return normalizedActivities.filter((activity) => {
    if (normalizedSearch && !createActivitySearchText(activity).includes(normalizedSearch)) {
      return false;
    }

    if (
      normalizedFilters.type !== DASHBOARD_FILTER_ANY &&
      activity.type !== normalizedFilters.type
    ) {
      return false;
    }

    if (
      normalizedFilters.status !== DASHBOARD_FILTER_ANY &&
      activity.status !== normalizedFilters.status
    ) {
      return false;
    }

    if (
      normalizedFilters.product !== DASHBOARD_FILTER_ANY &&
      activity.datasetName !== normalizedFilters.product
    ) {
      return false;
    }

    if (!matchesImportanceFilter(activity, normalizedFilters.importance)) {
      return false;
    }

    return matchesReportFilter(activity, normalizedFilters.reports);
  });
}

export function createDashboardSummaryRowFilterPatch(filters, { filterKey, rowValue } = {}) {
  const normalizedFilters = normalizeDashboardFilters(filters);
  const normalizedFilterKey = normalizeSummaryFilterKey(filterKey);

  if (!normalizedFilterKey) {
    return {};
  }

  const normalizedRowValue = normalizeTokenFilter(rowValue);

  if (normalizedRowValue === DASHBOARD_FILTER_ANY) {
    return { [normalizedFilterKey]: DASHBOARD_FILTER_ANY };
  }

  return {
    [normalizedFilterKey]:
      normalizedFilters[normalizedFilterKey] === normalizedRowValue
        ? DASHBOARD_FILTER_ANY
        : normalizedRowValue,
  };
}

export function isDashboardSummaryRowFilterActive(filters, { filterKey, rowValue } = {}) {
  const normalizedFilterKey = normalizeSummaryFilterKey(filterKey);

  if (!normalizedFilterKey) {
    return false;
  }

  const normalizedFilters = normalizeDashboardFilters(filters);
  return normalizedFilters[normalizedFilterKey] === normalizeTokenFilter(rowValue);
}

export function createFilteredDashboardView(dashboard, filters) {
  const source = isPlainObject(dashboard) ? dashboard : {};
  const filteredActivities = filterDashboardActivities(source.activities, filters);

  return {
    ...source,
    summary: createDashboardSummaryFromActivities(filteredActivities),
    statusSummary: createSummaryRows(filteredActivities, "status"),
    operationSummary: createSummaryRows(filteredActivities, "type"),
    importantChanges: filteredActivities.filter((activity) => activity.isImportant),
    activities: filteredActivities,
  };
}

function normalizeSummaryFilterKey(filterKey) {
  const normalizedKey = String(filterKey ?? "").trim();
  if (
    normalizedKey === DASHBOARD_SUMMARY_FILTER_KEYS.status ||
    normalizedKey === DASHBOARD_SUMMARY_FILTER_KEYS.operation
  ) {
    return normalizedKey;
  }

  return null;
}

function normalizeActivities(activities) {
  return Array.isArray(activities) ? activities : [];
}

function buildTokenOptions(values) {
  return [
    ...new Set(
      values.map(normalizeTokenFilter).filter((value) => value && value !== DASHBOARD_FILTER_ANY)
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: toTitleCase(value) }));
}

function buildProductOptions(activities) {
  return [
    ...new Set(
      activities
        .map((activity) => normalizeProductFilter(activity.datasetName))
        .filter((value) => value && value !== DASHBOARD_FILTER_ANY)
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
}

function keepValidOption(value, options) {
  if (value === DASHBOARD_FILTER_ANY) {
    return value;
  }

  const validValues = new Set(
    (Array.isArray(options) ? options : []).map((option) => option.value)
  );
  return validValues.has(value) ? value : DASHBOARD_FILTER_ANY;
}

function matchesImportanceFilter(activity, filterValue) {
  if (filterValue === DASHBOARD_IMPORTANCE_FILTERS.important) {
    return Boolean(activity.isImportant);
  }

  if (filterValue === DASHBOARD_IMPORTANCE_FILTERS.failed) {
    return FAILED_STATUSES.has(activity.status);
  }

  return true;
}

function matchesReportFilter(activity, filterValue) {
  const hasIcEncReports = (activity.links?.icEncReports?.length ?? 0) > 0;
  const hasInternalValidationReports = (activity.links?.internalValidationReports?.length ?? 0) > 0;

  if (filterValue === DASHBOARD_REPORT_FILTERS.any) {
    return hasIcEncReports || hasInternalValidationReports;
  }

  if (filterValue === DASHBOARD_REPORT_FILTERS.icEnc) {
    return hasIcEncReports;
  }

  if (filterValue === DASHBOARD_REPORT_FILTERS.internalValidation) {
    return hasInternalValidationReports;
  }

  return true;
}

function createSummaryRows(activities, key) {
  const rowsByLabel = new Map();

  for (const activity of activities) {
    const label = normalizeTokenFilter(activity[key], "unknown");
    const current = rowsByLabel.get(label) ?? { label, count: 0, failed: 0 };
    current.count += 1;

    if (FAILED_STATUSES.has(activity.status)) {
      current.failed += 1;
    }

    rowsByLabel.set(label, current);
  }

  return [...rowsByLabel.values()].sort((left, right) => {
    const countDifference = right.count - left.count;
    return countDifference === 0 ? left.label.localeCompare(right.label) : countDifference;
  });
}

function createActivitySearchText(activity) {
  const detailText = Array.isArray(activity.details)
    ? activity.details.map((item) => `${item.label} ${item.value}`).join(SEARCH_FIELDS_SEPARATOR)
    : "";

  return normalizeSearchComparisonText(
    [
      activity.timestamp,
      activity.datasetName,
      activity.productName,
      activity.type,
      activity.status,
      activity.severity,
      activity.title,
      activity.description,
      activity.actor,
      detailText,
    ].join(SEARCH_FIELDS_SEPARATOR)
  );
}

function normalizeTokenFilter(value, fallbackValue = DASHBOARD_FILTER_ANY) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalizedValue || fallbackValue;
}

function normalizeProductFilter(value, fallbackValue = DASHBOARD_FILTER_ANY) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || fallbackValue;
}

function normalizeSearchQuery(value) {
  return String(value ?? "").trim();
}

function normalizeSearchComparisonText(value) {
  return normalizeSearchQuery(value).toLowerCase();
}

function toTitleCase(value) {
  return String(value ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
