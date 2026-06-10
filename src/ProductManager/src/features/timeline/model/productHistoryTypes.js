export const PRODUCT_HISTORY_SOURCE = Object.freeze({
  BACKEND: "backend",
  DEMO: "demo",
});

export const PRODUCT_HISTORY_EVENT_TYPE = Object.freeze({
  STATUS: "status",
  FREEZE: "freeze",
  UNFREEZE: "unfreeze",
  EXPORT: "export",
  SEND: "send",
  ROLLBACK: "rollback",
  ANALYSIS: "analysis",
  NOTE: "note",
});

const EVENT_TYPE_LABELS = Object.freeze({
  [PRODUCT_HISTORY_EVENT_TYPE.STATUS]: "Status",
  [PRODUCT_HISTORY_EVENT_TYPE.FREEZE]: "Freeze",
  [PRODUCT_HISTORY_EVENT_TYPE.UNFREEZE]: "Unfreeze",
  [PRODUCT_HISTORY_EVENT_TYPE.EXPORT]: "Export",
  [PRODUCT_HISTORY_EVENT_TYPE.SEND]: "Send",
  [PRODUCT_HISTORY_EVENT_TYPE.ROLLBACK]: "Rollback",
  [PRODUCT_HISTORY_EVENT_TYPE.ANALYSIS]: "Analysis",
  [PRODUCT_HISTORY_EVENT_TYPE.NOTE]: "Note",
});

export function normalizeProductHistoryResponse(response) {
  const datasetName = normalizeText(response?.datasetName);
  const source = normalizeHistorySource(response?.source);
  const events = normalizeEvents(response?.events);

  return {
    endpointAvailable: Boolean(response?.endpointAvailable),
    datasetName,
    source,
    isDemo: source === PRODUCT_HISTORY_SOURCE.DEMO,
    generatedAt: normalizeText(response?.generatedAt) ?? new Date().toISOString(),
    warnings: normalizeWarnings(response?.warnings),
    events,
  };
}

export function getProductHistoryEventTypeLabel(type) {
  return EVENT_TYPE_LABELS[type] ?? EVENT_TYPE_LABELS[PRODUCT_HISTORY_EVENT_TYPE.NOTE];
}

export function sortProductHistoryEvents(events) {
  return [...events].sort(compareEventsDescending);
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) {
    return [];
  }

  return sortProductHistoryEvents(
    events.map((event, index) => normalizeEvent(event, index)).filter(Boolean)
  );
}

function normalizeEvent(event, index) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const type = normalizeEventType(event.type);
  const timestamp = normalizeText(event.timestamp);

  return {
    id:
      normalizeText(event.id) ??
      createFallbackEventId({
        type,
        timestamp,
        index,
      }),
    type,
    timestamp,
    title: normalizeText(event.title) ?? getProductHistoryEventTypeLabel(type),
    description: normalizeText(event.description),
    actor: normalizeText(event.actor),
    source: normalizeText(event.source),
    details: normalizeDetails(event.details),
  };
}

function normalizeDetails(details) {
  if (!details) {
    return [];
  }

  if (Array.isArray(details)) {
    return details
      .map((detail) => ({
        label: normalizeText(detail?.label),
        value: normalizeText(detail?.value),
      }))
      .filter((detail) => detail.label && detail.value);
  }

  if (typeof details === "object") {
    return Object.entries(details)
      .map(([label, value]) => ({
        label: formatDetailLabel(label),
        value: normalizeText(value),
      }))
      .filter((detail) => detail.label && detail.value);
  }

  return [];
}

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings.map(normalizeText).filter(Boolean);
}

function normalizeEventType(type) {
  const normalizedType = normalizeText(type);

  if (Object.values(PRODUCT_HISTORY_EVENT_TYPE).includes(normalizedType)) {
    return normalizedType;
  }

  return PRODUCT_HISTORY_EVENT_TYPE.NOTE;
}

function normalizeHistorySource(source) {
  const normalizedSource = normalizeText(source);

  if (Object.values(PRODUCT_HISTORY_SOURCE).includes(normalizedSource)) {
    return normalizedSource;
  }

  return PRODUCT_HISTORY_SOURCE.BACKEND;
}

function compareEventsDescending(left, right) {
  return getTimestampValue(right.timestamp) - getTimestampValue(left.timestamp);
}

function getTimestampValue(timestamp) {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function createFallbackEventId({ type, timestamp, index }) {
  return `${type}-${timestamp ?? "unknown"}-${index}`;
}

function formatDetailLabel(label) {
  return String(label ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
