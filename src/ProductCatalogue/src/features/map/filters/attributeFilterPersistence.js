import {
  readSavedPreferenceStatus,
  notifySavedPreferenceChanged,
} from "../../preferences/state/savedPreferenceStatus.js";
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
  providerAliases = ATTRIBUTE_FILTER_CONFIG.providerAliases,
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
      snapshot: migrateFilterProviders(JSON.parse(raw), providerAliases),
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
    notifySavedPreferenceChanged();
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
    notifySavedPreferenceChanged();
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

function migrateFilterProviders(snapshot, aliases) {
  if (!aliases || Object.keys(aliases).length === 0) return snapshot;
  let sources;
  if (snapshot?.version === 1 && Array.isArray(snapshot.layers)) {
    if (snapshot.layers.some((entry) => !entry?.layerId || !Array.isArray(entry.fields)))
      return snapshot;
    sources = snapshot.layers.map(({ layerId, fields }) => ({ providerId: layerId, fields }));
    const legacyId = ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.legacySnapshotProviderId;
    if (!sources.some((entry) => entry.providerId === legacyId)) {
      sources.push({ providerId: legacyId, fields: [] });
    }
  } else if (snapshot?.version === 2 && Array.isArray(snapshot.sources)) {
    sources = snapshot.sources;
  } else {
    return snapshot;
  }
  const explicitIds = new Set(sources.map((entry) => entry?.providerId));
  return {
    version: 2,
    sources: sources
      .filter((entry) => !aliases[entry?.providerId] || !explicitIds.has(aliases[entry.providerId]))
      .map((entry) =>
        entry && aliases[entry.providerId]
          ? { ...entry, providerId: aliases[entry.providerId] }
          : entry
      ),
  };
}

export function getSavedAttributeFilterStatus() {
  return readSavedPreferenceStatus(ATTRIBUTE_FILTER_CONFIG.storageKey, () => "Saved filter data");
}
