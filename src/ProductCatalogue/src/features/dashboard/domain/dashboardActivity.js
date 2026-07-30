import { createDashboardRangeDisplayLabel, DASHBOARD_TIME_ZONE } from "./dashboardRange.js";
import { createDashboardSummary } from "./dashboardSummary.js";

const DEFAULT_SEVERITY = "normal";
const DEFAULT_TYPE = "activity";
const FAILED_STATUSES = new Set(["failed", "error", "rejected"]);
const IMPORTANT_SEVERITIES = new Set(["important", "critical", "warning"]);
const IMPORTANT_TYPES = new Set(["export", "validation", "status", "send", "rollback"]);

export function normalizeDashboardPayload(
  payload,
  range,
  { isDemo = false, loadError = null } = {}
) {
  const data = unwrapDashboardPayload(payload);
  const activities = normalizeActivities(data.activities ?? data.Activities);
  const normalizedRange = normalizePayloadRange(data.range ?? data.Range, range);

  return {
    generatedAt:
      normalizeDateValue(data.generatedAt ?? data.GeneratedAt) ?? new Date().toISOString(),
    range: normalizedRange,
    summary: createDashboardSummary({
      summary: data.summary ?? data.Summary,
      activities,
    }),
    statusSummary: normalizeSummaryRows(data.statusSummary ?? data.StatusSummary, "status"),
    operationSummary: normalizeSummaryRows(data.operationSummary ?? data.OperationSummary, "type"),
    paging: normalizeDashboardPaging(data.paging ?? data.Paging, activities),
    filterOptions: normalizeDashboardFilterOptions(
      data.filterOptions ?? data.FilterOptions,
      activities
    ),
    importantChanges: activities.filter((activity) => activity.isImportant),
    activities,
    isDemo,
    loadError,
  };
}

export function normalizeActivities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeActivity).sort(compareActivitiesByTimestampDesc);
}

function normalizeActivity(value, index) {
  const source = isPlainObject(value) ? value : {};
  const timestamp = normalizeDateValue(
    readFirstDefined(source, ["timestamp", "Timestamp", "date", "Date"])
  );
  const type = normalizeToken(readFirstDefined(source, ["type", "Type"]), DEFAULT_TYPE);
  const status = normalizeToken(readFirstDefined(source, ["status", "Status"]), "completed");
  const severity = normalizeToken(
    readFirstDefined(source, ["severity", "Severity"]),
    DEFAULT_SEVERITY
  );
  const datasetName = normalizeText(
    readFirstDefined(source, ["datasetName", "DatasetName", "productName", "ProductName"])
  );

  const activity = {
    id:
      normalizeText(readFirstDefined(source, ["id", "Id", "activityId", "ActivityId"])) ||
      createFallbackActivityId(index, timestamp, datasetName, type),
    timestamp,
    datasetName,
    productName:
      normalizeText(readFirstDefined(source, ["productName", "ProductName", "name", "Name"])) ||
      datasetName,
    type,
    severity,
    status,
    title: normalizeText(readFirstDefined(source, ["title", "Title"])) || createFallbackTitle(type),
    description: normalizeText(
      readFirstDefined(source, ["description", "Description", "message", "Message"])
    ),
    actor: normalizeText(readFirstDefined(source, ["actor", "Actor", "user", "User"])),
    links: normalizeLinks(source.links ?? source.Links),
    details: normalizeDetails(source.details ?? source.Details),
    raw: source,
  };

  return {
    ...activity,
    isImportant: isImportantActivity(activity),
  };
}

function isImportantActivity(activity) {
  if (IMPORTANT_SEVERITIES.has(activity.severity)) {
    return true;
  }

  if (FAILED_STATUSES.has(activity.status)) {
    return true;
  }

  return IMPORTANT_TYPES.has(activity.type) && activity.status !== "completed";
}

function normalizeLinks(value) {
  const source = isPlainObject(value) ? value : {};
  const icEncReports = normalizeReportList(
    readFirstDefined(source, [
      "icEncReports",
      "IcEncReports",
      "ICENCReports",
      "icEncReport",
      "IcEncReport",
      "ICENCReport",
    ])
  );
  const internalValidationReports = normalizeReportList(
    readFirstDefined(source, [
      "internalValidationReports",
      "InternalValidationReports",
      "internalValidation",
      "InternalValidation",
    ])
  );

  return {
    review: Boolean(source.review ?? source.Review),
    analyze: Boolean(source.analyze ?? source.Analyze),
    history: Boolean(source.history ?? source.History),
    icEncReports,
    internalValidationReports,
    // Keep singular aliases during the frontend/backend contract transition.
    icEncReport: icEncReports[0] ?? { available: false, reportId: null, url: null },
    internalValidation: internalValidationReports[0] ?? {
      available: false,
      reportId: null,
      url: null,
    },
  };
}

function normalizeReportList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeReportMetadata).filter((report) => report.available);
  }

  const report = normalizeReportMetadata(value);
  return report.available ? [report] : [];
}

function normalizeReportMetadata(value) {
  if (value === true) {
    return {
      available: true,
      id: null,
      reportId: null,
      title: "Report",
      status: "available",
      generatedAt: null,
      url: null,
    };
  }

  if (!isPlainObject(value)) {
    return {
      available: false,
      id: null,
      reportId: null,
      title: "",
      status: "",
      generatedAt: null,
      url: null,
    };
  }

  const id = normalizeText(value.id ?? value.Id ?? value.reportId ?? value.ReportId);
  const url = normalizeText(value.url ?? value.Url ?? value.href ?? value.Href);

  return {
    available: Boolean(value.available ?? value.Available ?? id ?? url),
    id,
    reportId: id,
    title: normalizeText(value.title ?? value.Title) || "Report",
    status: normalizeToken(value.status ?? value.Status, "available"),
    generatedAt: normalizeDateValue(value.generatedAt ?? value.GeneratedAt),
    url,
    raw: value,
  };
}

function normalizeDetails(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((detail) => {
      if (!isPlainObject(detail)) {
        return null;
      }

      const label = normalizeText(detail.label ?? detail.Label);
      const detailValue = normalizeText(detail.value ?? detail.Value);

      if (!label && !detailValue) {
        return null;
      }

      return { label, value: detailValue };
    })
    .filter(Boolean);
}

function normalizePayloadRange(value, fallbackRange) {
  const source = isPlainObject(value) ? value : {};
  const preset =
    normalizeText(source.preset ?? source.Preset) || fallbackRange?.preset || "since-yesterday";
  const label = normalizeText(source.label ?? source.Label) || fallbackRange?.label || preset;
  const fromIso = normalizeDateValue(source.from ?? source.From) || fallbackRange?.fromIso || null;
  const toIso = normalizeDateValue(source.to ?? source.To) || fallbackRange?.toIso || null;
  const timeZone =
    normalizeText(source.timeZone ?? source.TimeZone) ||
    fallbackRange?.timeZone ||
    DASHBOARD_TIME_ZONE;

  return {
    preset,
    fromIso,
    toIso,
    timeZone,
    label,
    displayLabel:
      normalizeText(source.displayLabel ?? source.DisplayLabel) ||
      createDashboardRangeDisplayLabel({ label, fromIso, toIso, timeZone }),
  };
}

function normalizeSummaryRows(value, labelKey) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      if (!isPlainObject(row)) {
        return null;
      }

      const label = normalizeText(
        row[labelKey] ?? row[toPascalCase(labelKey)] ?? row.Label ?? row.label
      );
      const count = Number(row.count ?? row.Count);
      const failed = Number(row.failed ?? row.Failed);

      if (!label || !Number.isFinite(count)) {
        return null;
      }

      return {
        label,
        count,
        failed: Number.isFinite(failed) ? failed : 0,
      };
    })
    .filter(Boolean);
}

function compareActivitiesByTimestampDesc(left, right) {
  const leftTime = Date.parse(left.timestamp ?? "");
  const rightTime = Date.parse(right.timestamp ?? "");
  const timestampDifference =
    (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

function unwrapDashboardPayload(payload) {
  if (!isPlainObject(payload)) {
    return {};
  }

  if (isPlainObject(payload.data)) {
    return payload.data;
  }

  if (isPlainObject(payload.Data)) {
    return payload.Data;
  }

  return payload;
}

function readFirstDefined(source, keys) {
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeToken(value, fallbackValue) {
  const normalizedValue = normalizeText(value).toLowerCase();
  return normalizedValue || fallbackValue;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function createFallbackTitle(type) {
  return `${toTitleCase(type)} activity`;
}

function createFallbackActivityId(index, timestamp, datasetName, type) {
  return ["dashboard", index, timestamp || "unknown", datasetName || "product", type]
    .join("-")
    .replace(/[^a-z0-9_-]+/gi, "-");
}

function toTitleCase(value) {
  return String(value ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toPascalCase(value) {
  const text = String(value ?? "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function normalizeDashboardPaging(value, activities) {
  const source = isPlainObject(value) ? value : {};
  const returned = normalizeNonNegativeInteger(
    readFirstDefined(source, ["returned", "Returned"]),
    activities.length
  );
  const total = normalizeNonNegativeInteger(readFirstDefined(source, ["total", "Total"]), returned);
  const pageSizeValue = readFirstDefined(source, ["pageSize", "PageSize"]);
  const pageSize =
    pageSizeValue === null || pageSizeValue === undefined
      ? null
      : normalizeNonNegativeInteger(pageSizeValue, null);

  return {
    pageSize,
    returned,
    total,
    hasMore: Boolean(readFirstDefined(source, ["hasMore", "HasMore"])),
    nextCursor: normalizeText(readFirstDefined(source, ["nextCursor", "NextCursor"])) || null,
  };
}

function normalizeDashboardFilterOptions(value, activities) {
  const source = isPlainObject(value) ? value : {};

  return {
    types: normalizeFilterOptionList(source.types ?? source.Types, activities, "type"),
    statuses: normalizeFilterOptionList(source.statuses ?? source.Statuses, activities, "status"),
    products: normalizeFilterOptionList(
      source.products ?? source.Products,
      activities,
      "datasetName",
      { preserveCase: true }
    ),
  };
}

function normalizeFilterOptionList(value, activities, fallbackKey, { preserveCase = false } = {}) {
  const suppliedOptions = Array.isArray(value)
    ? value.map(normalizeFilterOption).filter(Boolean)
    : [];

  if (suppliedOptions.length > 0) {
    return suppliedOptions;
  }

  return [
    ...new Set(
      activities.map((activity) => String(activity?.[fallbackKey] ?? "").trim()).filter(Boolean)
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((optionValue) => ({
      value: preserveCase ? optionValue : optionValue.toLowerCase(),
      label: preserveCase ? optionValue : toTitleCase(optionValue),
    }));
}

function normalizeFilterOption(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const optionValue = normalizeText(value.value ?? value.Value);
  if (!optionValue) {
    return null;
  }

  return {
    value: optionValue,
    label: normalizeText(value.label ?? value.Label) || optionValue,
  };
}

function normalizeNonNegativeInteger(value, fallbackValue) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : fallbackValue;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
