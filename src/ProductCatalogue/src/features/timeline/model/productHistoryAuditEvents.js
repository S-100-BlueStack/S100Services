import { PRODUCT_HISTORY_EVENT_TYPE } from "./productHistoryTypes.js";

const SUCCESS_OUTCOMES = new Set(["Succeeded", "SucceededWithWarning"]);
const OUTCOME_LABELS = Object.freeze({
  Succeeded: "Succeeded",
  Failed: "Failed",
  SucceededWithWarning: "Succeeded with warning",
  RequiresManualReview: "Requires manual review",
});
const OPERATION_TYPES = Object.freeze({ Export: "export", Rollback: "rollback" });

export function normalizeExplicitProductHistoryEvents(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === "object")
    .map(normalizeExplicitEvent);
}

export function associateProductHistoryEvents(legacyEvents, explicitEvents) {
  const legacyStateRecordCounts = new Map();
  for (const event of legacyEvents) {
    if (event.sourceKind !== "legacy" || !event.stateRecordId) continue;
    legacyStateRecordCounts.set(
      event.stateRecordId,
      (legacyStateRecordCounts.get(event.stateRecordId) ?? 0) + 1
    );
  }
  const coveredStateRecords = new Map();
  for (const event of explicitEvents) {
    if (event.sourceKind !== "explicit") continue;
    const operationType = Object.hasOwn(OPERATION_TYPES, event.rawEventType)
      ? OPERATION_TYPES[event.rawEventType]
      : null;
    if (!operationType || !SUCCESS_OUTCOMES.has(event.outcome) || !event.stateRecordId) continue;
    if (!coveredStateRecords.has(operationType)) coveredStateRecords.set(operationType, new Set());
    coveredStateRecords.get(operationType).add(event.stateRecordId);
  }
  // A legacy ID must identify exactly one row in this payload, regardless of operation type.
  // Time is only used for display ordering, never for resolving an ambiguous ID.
  return [
    ...legacyEvents.filter(
      (event) =>
        event.sourceKind !== "legacy" ||
        !event.stateRecordId ||
        legacyStateRecordCounts.get(event.stateRecordId) !== 1 ||
        !coveredStateRecords.get(event.type)?.has(event.stateRecordId)
    ),
    ...explicitEvents,
  ];
}

function normalizeExplicitEvent(record, index) {
  const read = (name) => record[name] ?? record[name[0].toLowerCase() + name.slice(1)] ?? null;
  const rawEventType = read("EventType");
  const rawOutcome = read("Outcome");
  const type = Object.hasOwn(OPERATION_TYPES, rawEventType)
    ? OPERATION_TYPES[rawEventType]
    : PRODUCT_HISTORY_EVENT_TYPE.NOTE;
  const knownOutcome = Object.hasOwn(OUTCOME_LABELS, rawOutcome);
  const operationLabel =
    type === "export" ? "Export" : type === "rollback" ? "Cancel Export" : null;
  const operationMetadata = read("OperationMetadata");
  const exportTarget = read("ExportTarget");
  const stateRecordId = read("StateRecordId");
  const operationId = read("OperationId");
  const jobId = read("JobId");
  const correlationId = read("CorrelationId");
  return {
    id: read("Id") ?? `explicit-${index}`,
    datasetName: read("DatasetName"),
    type,
    presentationType:
      operationLabel && knownOutcome && SUCCESS_OUTCOMES.has(rawOutcome) ? type : "note",
    rawType: rawEventType,
    rawEventType,
    outcome: rawOutcome,
    rawOutcome,
    stateRecordId,
    operationId,
    jobId,
    correlationId,
    exportTarget,
    operationMetadata,
    sourceKind: "explicit",
    source: "Backend",
    timestamp: read("OccurredAtUtc"),
    title:
      operationLabel && knownOutcome
        ? `${operationLabel}: ${OUTCOME_LABELS[rawOutcome]}`
        : "History event",
    description: read("SafeMessage"),
    details: [
      { label: "Event type", value: operationLabel ?? rawEventType },
      { label: "Outcome", value: knownOutcome ? OUTCOME_LABELS[rawOutcome] : rawOutcome },
      { label: "Code", value: read("Code") },
      { label: "Operation ID", value: operationId },
      { label: "Job ID", value: jobId },
      { label: "Correlation ID", value: correlationId },
      { label: "State record ID", value: stateRecordId },
      { label: "Export target", value: formatExportTarget(exportTarget) },
      ...metadataDetails(operationMetadata),
    ],
  };
}

function metadataDetails(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata)
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => ({
      label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase()),
      value,
    }));
}

function formatExportTarget(value) {
  const normalized =
    value === null || value === undefined ? "" : String(value).trim().toUpperCase();
  if (normalized === "S100" || normalized === "S101") return "S-101";
  if (normalized === "S57") return "S-57";
  if (normalized === "S102") return "S-102";
  if (normalized === "S122") return "S-122";
  return value;
}
