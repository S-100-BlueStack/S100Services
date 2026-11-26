import { getStatusIdByName, getStatusName } from "../../data/stores/statusStore.js";
import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";
import { getUsageName } from "../../data/stores/usageStore.js";

const EMPTY_LABEL = "(empty)";

export function formatAttributeDisplayValue(fieldName, value, fallbackValue = value) {
  if (isEmptyValue(value) || fallbackValue === EMPTY_LABEL) {
    return EMPTY_LABEL;
  }

  if (isStatusField(fieldName)) {
    return formatStatusDisplayValue(value);
  }

  if (isUsageBandField(fieldName)) {
    return formatUsageBandDisplayValue(value);
  }

  return String(fallbackValue ?? value);
}

export function formatStatusDisplayValue(status) {
  if (isEmptyValue(status)) {
    return EMPTY_LABEL;
  }

  const lookupValue = normalizeLookupValue(status);
  const statusName = getStatusName(lookupValue);

  return String(statusName ?? status);
}

// Source-owned display only: keep generic source values and the lookup store intact.
export function resolveElectronicProductDisplayStatus(value) {
  return (
    normalizeElectronicProductStatus(value) ??
    (typeof value === "string"
      ? normalizeElectronicProductStatus(getStatusIdByName(value))
      : undefined)
  );
}

export function formatElectronicProductStatus(value) {
  const id = resolveElectronicProductDisplayStatus(value);
  return id === undefined ? "Unknown" : String(getStatusName(id));
}

export function formatUsageBandDisplayValue(usageBand) {
  if (isEmptyValue(usageBand)) {
    return EMPTY_LABEL;
  }

  const lookupValue = normalizeLookupValue(usageBand);
  const usageName = getUsageName(lookupValue);

  return String(usageName ?? usageBand);
}

function isStatusField(fieldName) {
  return normalizeFieldName(fieldName) === "status";
}

function isUsageBandField(fieldName) {
  return normalizeFieldName(fieldName) === "usageband";
}

function normalizeFieldName(fieldName) {
  return String(fieldName ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function isEmptyValue(value) {
  return value === null || value === undefined || value === "";
}

function normalizeLookupValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : value;
}
