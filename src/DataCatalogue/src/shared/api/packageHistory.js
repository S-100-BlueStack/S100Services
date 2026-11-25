import { normalizeSeverity } from "../domain/severity.js";
import { hasBindingCommentText } from "./bindingComments.js";

const EVENT_TYPES = new Set([
  "packageCreated",
  "severityUpdated",
  "detailedGeometryAdded",
  "geometryReplaced",
  "pipelineAssigned",
  "pipelineUnassigned",
  "bindingCommentAdded",
]);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

function invalidHistory() {
  return new Error("API returned invalid Package history.");
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) throw invalidHistory();
  return value;
}

export function normalizePackageHistoryPage(value, packageId, pageSize, before) {
  if (
    value?.packageId !== packageId ||
    !Array.isArray(value.items) ||
    value.items.length > pageSize ||
    (value.nextBefore !== null &&
      (typeof value.nextBefore !== "string" || !GUID.test(value.nextBefore)))
  ) {
    throw invalidHistory();
  }
  const seen = new Set();
  const items = value.items.map((item) => {
    const id = item?.id;
    if (
      typeof id !== "string" ||
      !GUID.test(id) ||
      id.toLowerCase() === before?.toLowerCase() ||
      seen.has(id.toLowerCase()) ||
      !EVENT_TYPES.has(item.eventType) ||
      typeof item.occurredAtUtc !== "string" ||
      !UTC_TIMESTAMP.test(item.occurredAtUtc) ||
      !Number.isFinite(Date.parse(item.occurredAtUtc))
    ) {
      throw invalidHistory();
    }
    seen.add(id.toLowerCase());
    const pipelineId = optionalText(item.pipelineId);
    const pipelineName = optionalText(item.pipelineName);
    const isComment = item.eventType === "bindingCommentAdded";
    const isBinding =
      isComment || ["pipelineAssigned", "pipelineUnassigned"].includes(item.eventType);
    const commentText = item.commentText ?? null;
    const actor = optionalText(item.actor);
    const severity = normalizeSeverity(item.severity);
    if (
      (isComment ? !hasBindingCommentText(commentText) || !actor : commentText !== null) ||
      isBinding !== Boolean(pipelineId) ||
      (!pipelineId && pipelineName) ||
      (item.eventType === "severityUpdated") !== (severity !== null)
    ) {
      throw invalidHistory();
    }
    return {
      id: id.toLowerCase(),
      eventType: item.eventType,
      occurredAtUtc: item.occurredAtUtc,
      actor,
      pipelineId,
      pipelineName,
      severity,
      ...(isComment ? { commentText } : {}),
    };
  });
  const nextBefore = value.nextBefore?.toLowerCase() ?? null;
  if (nextBefore && (items.length !== pageSize || nextBefore !== items.at(-1)?.id)) {
    throw invalidHistory();
  }
  // The API owns sub-millisecond ordering and ties; do not resort by JS Date.
  if (
    items.some(
      (item, i) => i > 0 && Date.parse(item.occurredAtUtc) > Date.parse(items[i - 1].occurredAtUtc)
    )
  ) {
    throw invalidHistory();
  }
  return { items, nextBefore };
}

export function validateHistoryRequest(pageSize, before) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Package history pageSize must be from 1 to 100.");
  }
  if (before != null && (typeof before !== "string" || !GUID.test(before))) {
    throw new Error("Invalid Package history continuation.");
  }
}
