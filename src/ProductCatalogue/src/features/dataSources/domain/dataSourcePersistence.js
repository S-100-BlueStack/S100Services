import {
  getDefaultEnabledSourceIds,
  getRuntimeSelectableDataSources,
} from "../config/dataSourceRegistry.js";

export const DATA_SOURCE_STORAGE_SCHEMA_VERSION = 2;
export const DATA_SOURCE_STORAGE_KEY = "productCatalogue.dataSources.v1";

export function createDataSourcePersistence({
  storage = globalThis.localStorage,
  storageKey = DATA_SOURCE_STORAGE_KEY,
} = {}) {
  return {
    read(registry) {
      return readDataSourceSelection({ storage, storageKey, registry });
    },
    write(registry, enabledSourceIds) {
      return writeDataSourceSelection({ storage, storageKey, registry, enabledSourceIds });
    },
    remove() {
      try {
        storage?.removeItem?.(storageKey);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function readDataSourceSelection({
  storage,
  storageKey = DATA_SOURCE_STORAGE_KEY,
  registry,
}) {
  const runtimeSelectableSources = getRuntimeSelectableDataSources(registry);
  const hasRuntimeSelectableSources = runtimeSelectableSources.length > 0;
  const persistableIds = getPersistableSourceIds(registry);
  const hasPersistableRuntimeSelectableSources = runtimeSelectableSources.some((source) =>
    persistableIds.has(source.id)
  );
  const defaults = getDefaultEnabledSourceIds(registry);
  let serialized;

  try {
    serialized = storage?.getItem?.(storageKey) ?? null;
  } catch {
    return createFallbackResult(
      "storage-error",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  if (serialized === null) {
    return createFallbackResult(
      "missing",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return createFallbackResult(
      "invalid-json",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  if (!parsed || typeof parsed !== "object") {
    return createFallbackResult(
      "invalid-shape",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  if (![1, DATA_SOURCE_STORAGE_SCHEMA_VERSION].includes(parsed.schemaVersion)) {
    return createFallbackResult(
      "unsupported-version",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  if (parsed.initialized !== true || !Array.isArray(parsed.enabledSourceIds)) {
    return createFallbackResult(
      "invalid-shape",
      defaults,
      hasRuntimeSelectableSources,
      hasPersistableRuntimeSelectableSources
    );
  }

  const selectableIds = new Set(runtimeSelectableSources.map((source) => source.id));
  const normalizedPersistedIds = normalizeIds(parsed.enabledSourceIds);
  const persistablePersistedIds = normalizedPersistedIds.filter((id) => persistableIds.has(id));
  const enabledSourceIds = persistablePersistedIds.filter((id) => selectableIds.has(id));
  if (parsed.schemaVersion === 1) {
    for (const source of runtimeSelectableSources) {
      if (
        source.persistence?.persistSelection !== false &&
        source.persistence?.enabledInSchema1 &&
        !enabledSourceIds.includes(source.id)
      ) {
        enabledSourceIds.push(source.id);
      }
    }
  }

  const preservedUnavailableSourceIds = persistablePersistedIds.filter(
    (id) => !selectableIds.has(id)
  );
  const hasInvalidUnknownOrRetiredIds =
    normalizedPersistedIds.length !== parsed.enabledSourceIds.length ||
    persistablePersistedIds.length !== normalizedPersistedIds.length;

  return {
    status: "valid",
    enabledSourceIds,
    preservedUnavailableSourceIds,
    shouldPersist:
      hasInvalidUnknownOrRetiredIds ||
      (hasPersistableRuntimeSelectableSources && parsed.schemaVersion === 1),
    isFirstVisit: false,
    hasRuntimeSelectableSources,
  };
}

export function writeDataSourceSelection({
  storage,
  storageKey = DATA_SOURCE_STORAGE_KEY,
  registry,
  enabledSourceIds,
}) {
  const runtimeSelectableSources = getRuntimeSelectableDataSources(registry);
  const persistableIds = getPersistableSourceIds(registry);
  const selectableIds = new Set(runtimeSelectableSources.map((source) => source.id));
  const hasPersistableRuntimeSelectableSources = runtimeSelectableSources.some((source) =>
    persistableIds.has(source.id)
  );
  const persistedSelection = readPersistedSelection({ storage, storageKey });

  // Do not create initialized storage when the deployment has no persistable
  // choices. Existing state may still be rewritten to remove retired/unknown
  // source IDs while preserving intent for known unavailable sources.
  if (!hasPersistableRuntimeSelectableSources && !persistedSelection) {
    return true;
  }

  const requestedEnabledIds = new Set(
    normalizeIds(enabledSourceIds).filter((id) => selectableIds.has(id) && persistableIds.has(id))
  );
  const preservedUnavailableIds = new Set(
    normalizeIds(persistedSelection?.enabledSourceIds).filter(
      (id) => persistableIds.has(id) && !selectableIds.has(id)
    )
  );
  const normalizedEnabledIds = registry.definitions
    .map((source) => source.id)
    .filter(
      (sourceId) =>
        persistableIds.has(sourceId) &&
        (requestedEnabledIds.has(sourceId) || preservedUnavailableIds.has(sourceId))
    );
  const payload = {
    schemaVersion: DATA_SOURCE_STORAGE_SCHEMA_VERSION,
    initialized: true,
    enabledSourceIds: normalizedEnabledIds,
  };

  try {
    storage?.setItem?.(storageKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function readPersistedSelection({ storage, storageKey }) {
  let parsed;

  try {
    const serialized = storage?.getItem?.(storageKey) ?? null;
    if (serialized === null) {
      return null;
    }
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    ![1, DATA_SOURCE_STORAGE_SCHEMA_VERSION].includes(parsed.schemaVersion) ||
    parsed.initialized !== true ||
    !Array.isArray(parsed.enabledSourceIds)
  ) {
    return null;
  }

  return parsed;
}

function getPersistableSourceIds(registry) {
  return new Set(
    registry.definitions
      .filter((source) => source.persistence?.persistSelection !== false)
      .map((source) => source.id)
  );
}

function createFallbackResult(
  status,
  enabledSourceIds,
  hasRuntimeSelectableSources,
  hasPersistableRuntimeSelectableSources
) {
  return {
    status,
    enabledSourceIds: [...enabledSourceIds],
    preservedUnavailableSourceIds: [],
    shouldPersist: hasPersistableRuntimeSelectableSources,
    isFirstVisit: status === "missing",
    hasRuntimeSelectableSources,
  };
}

function normalizeIds(values) {
  const seen = new Set();
  const normalized = [];

  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}
