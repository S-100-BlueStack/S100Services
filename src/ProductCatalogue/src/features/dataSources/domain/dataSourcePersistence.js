import {
  getDefaultEnabledSourceIds,
  getRuntimeSelectableDataSources,
} from "../config/dataSourceRegistry.js";

export const DATA_SOURCE_STORAGE_SCHEMA_VERSION = 1;
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
  const defaults = getDefaultEnabledSourceIds(registry);
  let serialized;

  try {
    serialized = storage?.getItem?.(storageKey) ?? null;
  } catch {
    return createFallbackResult("storage-error", defaults, hasRuntimeSelectableSources);
  }

  if (serialized === null) {
    return createFallbackResult("missing", defaults, hasRuntimeSelectableSources);
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return createFallbackResult("invalid-json", defaults, hasRuntimeSelectableSources);
  }

  if (!parsed || typeof parsed !== "object") {
    return createFallbackResult("invalid-shape", defaults, hasRuntimeSelectableSources);
  }

  if (parsed.schemaVersion !== DATA_SOURCE_STORAGE_SCHEMA_VERSION) {
    return createFallbackResult("unsupported-version", defaults, hasRuntimeSelectableSources);
  }

  if (parsed.initialized !== true || !Array.isArray(parsed.enabledSourceIds)) {
    return createFallbackResult("invalid-shape", defaults, hasRuntimeSelectableSources);
  }

  const selectableIds = new Set(runtimeSelectableSources.map((source) => source.id));
  const knownIds = new Set(registry.definitions.map((source) => source.id));
  const normalizedPersistedIds = normalizeIds(parsed.enabledSourceIds);
  const knownPersistedIds = normalizedPersistedIds.filter((id) => knownIds.has(id));
  const enabledSourceIds = knownPersistedIds.filter((id) => selectableIds.has(id));
  const preservedUnavailableSourceIds = knownPersistedIds.filter((id) => !selectableIds.has(id));
  const hasInvalidOrUnknownIds =
    normalizedPersistedIds.length !== parsed.enabledSourceIds.length ||
    knownPersistedIds.length !== normalizedPersistedIds.length;

  return {
    status: "valid",
    enabledSourceIds,
    preservedUnavailableSourceIds,
    shouldPersist: hasRuntimeSelectableSources && hasInvalidOrUnknownIds,
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

  // No persisted selection is created or rewritten when the deployment offers
  // no choices. This keeps a future deployment with real loaders eligible for
  // first-visit defaults and preserves prior selection intent during outages.
  if (runtimeSelectableSources.length === 0) {
    return true;
  }

  const selectableIds = new Set(runtimeSelectableSources.map((source) => source.id));
  const requestedEnabledIds = new Set(
    normalizeIds(enabledSourceIds).filter((id) => selectableIds.has(id))
  );
  const preservedUnavailableIds = new Set(
    readPersistedKnownUnavailableSourceIds({
      storage,
      storageKey,
      registry,
      selectableIds,
    })
  );
  const normalizedEnabledIds = registry.definitions
    .map((source) => source.id)
    .filter(
      (sourceId) => requestedEnabledIds.has(sourceId) || preservedUnavailableIds.has(sourceId)
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

function readPersistedKnownUnavailableSourceIds({ storage, storageKey, registry, selectableIds }) {
  let parsed;

  try {
    const serialized = storage?.getItem?.(storageKey) ?? null;
    if (serialized === null) {
      return [];
    }
    parsed = JSON.parse(serialized);
  } catch {
    return [];
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.schemaVersion !== DATA_SOURCE_STORAGE_SCHEMA_VERSION ||
    parsed.initialized !== true ||
    !Array.isArray(parsed.enabledSourceIds)
  ) {
    return [];
  }

  const knownIds = new Set(registry.definitions.map((source) => source.id));
  return normalizeIds(parsed.enabledSourceIds).filter(
    (id) => knownIds.has(id) && !selectableIds.has(id)
  );
}

function createFallbackResult(status, enabledSourceIds, hasRuntimeSelectableSources) {
  return {
    status,
    enabledSourceIds: [...enabledSourceIds],
    preservedUnavailableSourceIds: [],
    shouldPersist: hasRuntimeSelectableSources,
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
