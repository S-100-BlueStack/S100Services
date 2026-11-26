import { hasBindingCommentText, trimBindingComment } from "./bindingComments.js";

export const PACKAGE_STATUS_LABELS = Object.freeze({
  assigned: "Assigned",
  notAssigned: "Not assigned",
  discarded: "Discarded",
});

const GUID =
  /^(?!00000000-0000-0000-0000-000000000000)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

export function isPackageOperationId(value) {
  return typeof value === "string" && GUID.test(value);
}

export function normalizePackageOperation(item) {
  if (
    !isPackageOperationId(item?.id) ||
    !isPackageOperationId(item.historyEventId) ||
    item.historyEventId.toLowerCase() === item.id.toLowerCase() ||
    !["discardReason", "reopen"].includes(item.kind) ||
    (item.kind === "reopen" ? item.text !== null : !hasBindingCommentText(item.text)) ||
    typeof item.actor !== "string" ||
    !item.actor.trim() ||
    typeof item.occurredAtUtc !== "string" ||
    !UTC.test(item.occurredAtUtc) ||
    !Number.isFinite(Date.parse(item.occurredAtUtc))
  ) {
    throw new Error("API returned an invalid Package operation.");
  }
  return {
    id: item.id.toLowerCase(),
    historyEventId: item.historyEventId.toLowerCase(),
    kind: item.kind,
    text: item.text,
    actor: item.actor,
    occurredAtUtc: item.occurredAtUtc,
    assignmentStatus: item.assignmentStatus,
  };
}

export function normalizePackageCommentPage(value, packageId, pageSize, before) {
  if (
    value?.packageId !== packageId ||
    !Array.isArray(value.items) ||
    value.items.length > pageSize ||
    (value.nextBefore !== null && !isPackageOperationId(value.nextBefore))
  ) {
    throw new Error("API returned an invalid Package comment page.");
  }
  const items = value.items.map(normalizePackageOperation);
  const seen = new Set(before ? [before.toLowerCase()] : []);
  for (const item of items) {
    if (item.kind !== "discardReason" || seen.has(item.id)) {
      throw new Error("Invalid Package comment continuation.");
    }
    seen.add(item.id);
  }
  const nextBefore = value.nextBefore?.toLowerCase() ?? null;
  if (nextBefore && (items.length !== pageSize || items.at(-1).id !== nextBefore)) {
    throw new Error("Invalid Package comment continuation.");
  }
  return { items, nextBefore };
}

export function operationText(operation) {
  return operation.kind === "reopen" ? null : trimBindingComment(operation.text);
}
