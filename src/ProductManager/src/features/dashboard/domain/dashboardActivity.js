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

  return {
    generatedAt:
      normalizeDateValue(data.generatedAt ?? data.GeneratedAt) ?? new Date().toISOString(),
    range: normalizePayloadRange(data.range ?? data.Range, range),
    summary: createDashboardSummary({
      summary: data.summary ?? data.Summary,
      activities,
    }),
    statusSummary: normalizeSummaryRows(data.statusSummary ?? data.StatusSummary, "status"),
    operationSummary: normalizeSummaryRows(data.operationSummary ?? data.OperationSummary, "type"),
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

  return {
    review: Boolean(source.review ?? source.Review),
    analyze: Boolean(source.analyze ?? source.Analyze),
    history: Boolean(source.history ?? source.History),
    icEncReport: normalizeReportLink(
      source.icEncReport ?? source.IcEncReport ?? source.ICENCReport
    ),
    internalValidation: normalizeReportLink(source.internalValidation ?? source.InternalValidation),
  };
}

function normalizeReportLink(value) {
  if (value === true) {
    return { available: true, reportId: null, url: null };
  }

  if (!isPlainObject(value)) {
    return { available: false, reportId: null, url: null };
  }

  return {
    available: Boolean(value.available ?? value.Available),
    reportId: normalizeText(value.reportId ?? value.ReportId ?? value.id ?? value.Id),
    url: normalizeText(value.url ?? value.Url ?? value.href ?? value.Href),
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

  return {
    preset:
      normalizeText(source.preset ?? source.Preset) || fallbackRange?.preset || "since-yesterday",
    fromIso: normalizeDateValue(source.from ?? source.From) || fallbackRange?.fromIso || null,
    toIso: normalizeDateValue(source.to ?? source.To) || fallbackRange?.toIso || null,
    label: normalizeText(source.label ?? source.Label) || fallbackRange?.label || null,
    displayLabel:
      normalizeText(source.displayLabel ?? source.DisplayLabel) ||
      fallbackRange?.displayLabel ||
      null,
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

      const label = normalizeText(row[labelKey] ?? row.Label ?? row.label);
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

  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
