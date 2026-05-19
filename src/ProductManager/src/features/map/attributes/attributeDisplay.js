import { getStatusName } from "../../data/stores/statusStore.js";

const EMPTY_LABEL = "(empty)";

export function formatAttributeDisplayValue(fieldName, value, fallbackValue = value) {
  if (isEmptyValue(value) || fallbackValue === EMPTY_LABEL) {
    return EMPTY_LABEL;
  }

  if (isStatusField(fieldName)) {
    return formatStatusDisplayValue(value);
  }

  return String(fallbackValue ?? value);
}

export function formatStatusDisplayValue(status) {
  if (isEmptyValue(status)) {
    return EMPTY_LABEL;
  }

  const lookupValue = normalizeStatusLookupValue(status);
  const statusName = getStatusName(lookupValue);

  return String(statusName ?? status);
}

function isStatusField(fieldName) {
  return String(fieldName).toLowerCase() === "status";
}

function isEmptyValue(value) {
  return value === null || value === undefined || value === "";
}

function normalizeStatusLookupValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : value;
}
