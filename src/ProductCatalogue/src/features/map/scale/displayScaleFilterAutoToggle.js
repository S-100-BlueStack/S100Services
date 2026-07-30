import {
  isDisplayScaleHidingDisabled,
  setDisplayScaleHidingDisabled,
} from "./displayScaleOverrideState.js";

const DISPLAY_SCALE_FIELD_KEY = "displayscale";

export function autoDisableDisplayScaleHidingForActiveFilters(activeFilters) {
  if (!hasActiveDisplayScaleFilter(activeFilters)) {
    return;
  }

  if (isDisplayScaleHidingDisabled()) {
    return;
  }

  setDisplayScaleHidingDisabled(true, {
    source: "displayScaleFilter",
  });
}

function hasActiveDisplayScaleFilter(activeFilters) {
  if (!activeFilters) {
    return false;
  }

  if (activeFilters instanceof Map) {
    return hasActiveDisplayScaleFilterInEntries(activeFilters.entries());
  }

  if (Array.isArray(activeFilters)) {
    return activeFilters.some(hasActiveDisplayScaleFilterEntry);
  }

  if (typeof activeFilters === "object") {
    return hasActiveDisplayScaleFilterInEntries(Object.entries(activeFilters));
  }

  return false;
}

function hasActiveDisplayScaleFilterInEntries(entries) {
  for (const [fieldName, filterValue] of entries) {
    if (isDisplayScaleField(fieldName) && hasActiveFilterValue(filterValue)) {
      return true;
    }
  }

  return false;
}

function hasActiveDisplayScaleFilterEntry(entry) {
  const fieldName = entry?.fieldName ?? entry?.field ?? entry?.name ?? entry?.key;
  const filterValue = entry?.value ?? entry?.values ?? entry?.range ?? entry;

  return isDisplayScaleField(fieldName) && hasActiveFilterValue(filterValue);
}

function isDisplayScaleField(fieldName) {
  return normalizeFieldName(fieldName) === DISPLAY_SCALE_FIELD_KEY;
}

function normalizeFieldName(fieldName) {
  return String(fieldName ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function hasActiveFilterValue(value) {
  if (value == null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value instanceof Set || value instanceof Map) {
    return value.size > 0;
  }

  if (typeof value === "object") {
    return Object.values(value).some((item) => item != null && String(item).trim() !== "");
  }

  return String(value).trim().length > 0;
}
