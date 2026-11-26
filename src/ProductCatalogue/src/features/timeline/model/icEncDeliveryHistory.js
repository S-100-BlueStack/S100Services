import { buildUrl } from "../../../shared/api/apiClient.js";
import { isWorkspaceAvailableDataSource } from "../../dataSources/config/dataSourceRegistry.js";
import {
  PRODUCT_CONTENT_TYPE,
  getProductContentConfiguration,
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
} from "../../products/domain/productContext.js";

const GUID = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const filenameGuidPattern = new RegExp(GUID, "gi");
const guidPattern = new RegExp(`^${GUID}$`, "i");
const reportRoute = new RegExp(`(?:^|/)(electronicproducts/([^/?#]+)/artifacts/(${GUID}))$`, "i");
const transportStatuses = new Set(["Sending", "Delivered", "Uncertain", "NotDelivered"]);
const outcomes = new Set(["Accepted", "Rejected"]);
const attemptLimit = 50;
const reportLimit = 20;

export function getIcEncHistorySpecification(context, registry) {
  const source = registry?.byId.get(context?.sourceId);
  const specification = source?.normalizer?.specification;
  const attributes = context?.data?.attributes ?? context?.graphic?.attributes;
  if (
    !["S57", "S101"].includes(specification) ||
    !registry.definitions.includes(source) ||
    !isWorkspaceAvailableDataSource(source) ||
    context.productType !== source.productType ||
    attributes?.productSpecification !== specification ||
    source.contentConfiguration?.history?.loaderId !== "electronic-history" ||
    source.contentConfiguration?.icEncReports?.loaderId !== "electronic-artifacts" ||
    source.capabilities?.history !== true ||
    source.capabilities?.icEncReports !== true ||
    !productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.HISTORY) ||
    !productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.IC_ENC_REPORTS)
  ) {
    return null;
  }

  const reports = getProductContentConfiguration(context, PRODUCT_CONTENT_TYPE.IC_ENC_REPORTS);
  return reports.visible && reports.implemented && reports.loaderId === "electronic-artifacts"
    ? specification
    : null;
}

export function normalizeIcEncDeliveryHistory(section, datasetName, specification) {
  const unavailable = { availability: "Unavailable", hasMore: null, items: [] };
  if (
    section?.Availability !== "Available" ||
    !sameDataset(section.DatasetName, datasetName) ||
    section.ProductSpecification !== specification ||
    typeof section.HasMore !== "boolean" ||
    !Array.isArray(section.Items)
  ) {
    return unavailable;
  }

  const items = section.Items.slice(0, attemptLimit).map((item) =>
    normalizeItem(item, datasetName)
  );
  if (items.some((item) => !item) || new Set(items.map((item) => item.id)).size !== items.length) {
    return unavailable;
  }

  // Keep the server's deterministic SQL ordering, including its GUID tie breaks.
  return {
    availability: "Available",
    hasMore: section.HasMore || section.Items.length > attemptLimit,
    items,
  };
}

function normalizeItem(item, datasetName) {
  const id = normalizeGuid(item?.DeliveryId);
  const reservedAt = normalizeUtc(item?.ReservedAtUtc);
  if (
    !id ||
    !reservedAt ||
    !Number.isInteger(item.Edition) ||
    item.Edition < 0 ||
    !Number.isInteger(item.Update) ||
    item.Update < 0
  ) {
    return null;
  }

  const decision =
    item.Decision == null
      ? null
      : {
          outcome: item.Decision.Outcome,
          source: ["Manual", "Email", "Simulation"].includes(item.Decision.Source)
            ? item.Decision.Source
            : null,
          recordedAt: normalizeUtc(item.Decision.RecordedAtUtc),
        };
  if (
    decision
      ? !outcomes.has(decision.outcome) || item.TransportStatus != null
      : !transportStatuses.has(item.TransportStatus)
  ) {
    return null;
  }

  const { reports, reportsAvailability } = normalizeReports(item, datasetName, decision);
  return {
    id,
    edition: item.Edition,
    update: item.Update,
    reservedAt,
    completedAt: normalizeUtc(item.CompletedAtUtc),
    transportStatus: decision ? null : item.TransportStatus,
    decision,
    reports,
    reportsAvailability,
  };
}

function normalizeReports(item, datasetName, decision) {
  if (
    !["Available", "Partial"].includes(item.ReportsAvailability) ||
    !Array.isArray(item.Reports)
  ) {
    return { reports: [], reportsAvailability: "Unavailable" };
  }

  const keys = new Set();
  const reports = [];
  for (const report of item.Reports.slice(0, reportLimit)) {
    const id = normalizeGuid(report?.ArtifactId);
    const storedAt = normalizeUtc(report?.StoredAtUtc);
    const url = id && normalizeDownload(report.DownloadUrl, datasetName, id);
    if (!url || !storedAt || typeof report.FileName !== "string" || !report.FileName.trim()) {
      continue;
    }
    if (keys.has(id)) continue;
    keys.add(id);
    reports.push({
      id,
      fileName: report.FileName.replace(filenameGuidPattern, "…"),
      storedAt,
      url,
      fromDecisionEmail: decision?.source === "Email" && report.FromDecisionEmail === true,
    });
  }

  return {
    reports,
    reportsAvailability:
      reports.length < item.Reports.length ? "Partial" : item.ReportsAvailability,
  };
}

function normalizeDownload(value, datasetName, artifactId) {
  const match = typeof value === "string" && value.match(reportRoute);
  if (!match || normalizeGuid(match[3]) !== artifactId) return null;
  const [, path, encodedName] = match;
  const url = buildUrl(path);
  if (value !== url && value !== `/${path}` && value !== path) return null;

  try {
    const owner = decodeURIComponent(encodedName);
    if (
      owner === "." ||
      owner === ".." ||
      [...owner].some((character) => {
        const code = character.charCodeAt(0);
        return character === "/" || character === "\\" || code < 32 || code === 127;
      }) ||
      !sameDataset(owner, datasetName)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalizeGuid(value) {
  return typeof value === "string" &&
    guidPattern.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000"
    ? value.toLowerCase()
    : null;
}

function sameDataset(value, expected) {
  return typeof value === "string" && value.toUpperCase() === expected.toUpperCase();
}

function normalizeUtc(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}
