export function normalizeInternalValidationReports(value) {
  return getReportCandidates(value)
    .map((report, index) => normalizeInternalValidationReport(report, index))
    .filter(Boolean);
}

function normalizeInternalValidationReport(report, index) {
  if (report === null || report === undefined) {
    return null;
  }

  if (typeof report === "string") {
    const content = report.trim();

    if (!content) {
      return null;
    }

    return {
      id: `internal-validation-${index + 1}`,
      title: `Internal validation report ${index + 1}`,
      status: "available",
      source: "Internal validation",
      generatedAt: null,
      summary: "",
      format: inferReportFormat(content),
      content,
      raw: report,
    };
  }

  if (!isPlainObject(report)) {
    return null;
  }

  const content = readReportContent(report);
  const title = normalizeText(
    readFirstDefined(report, ["title", "Title", "name", "Name", "reportName", "ReportName"])
  );
  const type = normalizeText(readFirstDefined(report, ["type", "Type", "reportType", "ReportType"]));
  const id = normalizeText(
    readFirstDefined(report, ["id", "Id", "reportId", "ReportId", "key", "Key"])
  );
  const status = normalizeText(
    readFirstDefined(report, ["status", "Status", "result", "Result", "state", "State"])
  );
  const source = normalizeText(readFirstDefined(report, ["source", "Source", "system", "System"]));
  const generatedAt = normalizeText(
    readFirstDefined(report, [
      "generatedAt",
      "GeneratedAt",
      "createdAt",
      "CreatedAt",
      "date",
      "Date",
      "timestamp",
      "Timestamp",
    ])
  );
  const summary = normalizeText(
    readFirstDefined(report, ["summary", "Summary", "message", "Message", "description", "Description"])
  );
  const explicitFormat = normalizeText(
    readFirstDefined(report, ["format", "Format", "contentType", "ContentType", "mimeType", "MimeType"])
  );

  if (!title && !type && !status && !source && !generatedAt && !summary && !hasReportContent(content)) {
    return null;
  }

  return {
    id: id || createStableReportId(title || type || source || status || `report-${index + 1}`, index),
    title: title || type || `Internal validation report ${index + 1}`,
    status: status || "available",
    source: source || "Internal validation",
    generatedAt: generatedAt || null,
    summary,
    format: normalizeReportFormat(explicitFormat, content),
    content,
    raw: report,
  };
}

function getReportCandidates(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isPlainObject(value)) {
    return value === null || value === undefined ? [] : [value];
  }

  const nested = readFirstDefined(value, [
    "reports",
    "Reports",
    "items",
    "Items",
    "validationReports",
    "ValidationReports",
    "internalValidationReports",
    "InternalValidationReports",
  ]);

  if (nested !== undefined) {
    return getReportCandidates(nested);
  }

  return [value];
}

function readReportContent(report) {
  const value = readFirstDefined(report, [
    "content",
    "Content",
    "text",
    "Text",
    "body",
    "Body",
    "report",
    "Report",
    "xml",
    "Xml",
    "XML",
    "json",
    "Json",
    "JSON",
  ]);

  if (value === undefined || value === null) {
    return "";
  }

  return value;
}

function normalizeReportFormat(explicitFormat, content) {
  const normalizedFormat = explicitFormat.toLowerCase();

  if (normalizedFormat.includes("json")) {
    return "json";
  }

  if (normalizedFormat.includes("xml")) {
    return "xml";
  }

  if (normalizedFormat.includes("html")) {
    return "html";
  }

  return inferReportFormat(content);
}

function inferReportFormat(content) {
  if (isPlainObject(content) || Array.isArray(content)) {
    return "json";
  }

  const text = String(content ?? "").trim();

  if (text.startsWith("<")) {
    return "xml";
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return "json";
  }

  return "text";
}

function hasReportContent(content) {
  if (isPlainObject(content) || Array.isArray(content)) {
    return true;
  }

  return String(content ?? "").trim().length > 0;
}

function createStableReportId(value, index) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedValue ? `${normalizedValue}-${index + 1}` : `internal-validation-${index + 1}`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function readFirstDefined(source, keys) {
  if (!isPlainObject(source)) {
    return undefined;
  }

  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
