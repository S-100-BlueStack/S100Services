import { ATTRIBUTE_FILTER_CONFIG } from "./attributeFilterConfig.js";

export const ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS = Object.freeze({
  MISSING: "missing",
  PARSED: "parsed",
  INVALID: "invalid",
  UNAVAILABLE: "unavailable",
});

export function readAttributeFilterSnapshot({
  storage = getDefaultStorage(),
  storageKey = ATTRIBUTE_FILTER_CONFIG.storageKey,
} = {}) {
  if (!storage?.getItem) {
    return createReadResult(ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.UNAVAILABLE);
  }

  let raw;
  try {
    raw = storage.getItem(storageKey);
  } catch (error) {
    return createReadResult(ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.UNAVAILABLE, {
      error,
    });
  }

  if (raw === null) {
    return createReadResult(ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.MISSING);
  }

  try {
    return createReadResult(ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.PARSED, {
      exists: true,
      snapshot: JSON.parse(raw),
    });
  } catch (error) {
    // Preserve the fact that a value existed so the panel can remove the
    // malformed state before falling back to declarative first-visit defaults.
    return createReadResult(ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.INVALID, {
      exists: true,
      error,
    });
  }
}

export function writeAttributeFilterSnapshot(
  filterService,
  { storage = getDefaultStorage(), storageKey = ATTRIBUTE_FILTER_CONFIG.storageKey } = {}
) {
  if (!storage?.setItem || !filterService?.getFilterSnapshot) {
    return { written: false, error: null };
  }

  try {
    storage.setItem(storageKey, JSON.stringify(filterService.getFilterSnapshot()));
    return { written: true, error: null };
  } catch (error) {
    return { written: false, error };
  }
}

export function removeAttributeFilterSnapshot({
  storage = getDefaultStorage(),
  storageKey = ATTRIBUTE_FILTER_CONFIG.storageKey,
} = {}) {
  if (!storage?.removeItem) {
    return { removed: false, error: null };
  }

  try {
    storage.removeItem(storageKey);
    return { removed: true, error: null };
  } catch (error) {
    return { removed: false, error };
  }
}

function createReadResult(status, { exists = false, snapshot = null, error = null } = {}) {
  return {
    status,
    exists,
    snapshot,
    error,
  };
}

function getDefaultStorage() {
  return globalThis.window?.localStorage ?? globalThis.localStorage ?? null;
}
