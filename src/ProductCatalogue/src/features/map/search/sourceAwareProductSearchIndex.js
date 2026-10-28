const DEFAULT_SEARCH_FIELDS = Object.freeze(["datasetName", "productName", "productKey"]);
const DEFAULT_RESULT_LIMIT = 10;
const REPRESENTATIVE_OBJECT_ID_FIELDS = Object.freeze(["OBJECTID", "objectId", "FID", "featureId"]);

export function createSourceAwareProductSearchIndex() {
  const providers = new Map();
  const listeners = new Set();
  const latestGenerationByProvider = new Map();

  function replaceProvider({
    providerId,
    sourceId = null,
    sourceLabel = "",
    generation = 0,
    layers = [],
    searchFields = DEFAULT_SEARCH_FIELDS,
  } = {}) {
    const normalizedProviderId = normalizeRequiredValue(providerId, "providerId");
    const normalizedGeneration = normalizeGeneration(generation);
    const current = providers.get(normalizedProviderId);
    const latestGeneration = latestGenerationByProvider.get(normalizedProviderId);

    if (
      (latestGeneration !== undefined && normalizedGeneration < latestGeneration) ||
      (!current && latestGeneration !== undefined && normalizedGeneration === latestGeneration)
    ) {
      return { published: false, stale: true, count: current?.entries.size ?? 0 };
    }

    const entries = buildEntries({
      providerId: normalizedProviderId,
      sourceId,
      sourceLabel,
      generation: normalizedGeneration,
      layers,
      searchFields,
    });

    providers.set(normalizedProviderId, {
      providerId: normalizedProviderId,
      sourceId: normalizeOptionalValue(sourceId),
      sourceLabel: normalizeOptionalValue(sourceLabel),
      generation: normalizedGeneration,
      entries,
    });
    latestGenerationByProvider.set(normalizedProviderId, normalizedGeneration);
    emit({ type: current ? "replaced" : "added", providerId: normalizedProviderId });

    return { published: true, stale: false, count: entries.size };
  }

  function removeProvider(providerId, { generation } = {}) {
    const normalizedProviderId = normalizeOptionalValue(providerId);
    if (!normalizedProviderId) {
      return { removed: false, stale: false };
    }

    const current = providers.get(normalizedProviderId);
    const normalizedGeneration =
      generation == null
        ? (latestGenerationByProvider.get(normalizedProviderId) ?? current?.generation ?? 0) + 1
        : normalizeGeneration(generation);
    const latestGeneration =
      latestGenerationByProvider.get(normalizedProviderId) ?? current?.generation ?? 0;
    if (normalizedGeneration < latestGeneration) {
      return { removed: false, stale: true };
    }

    latestGenerationByProvider.set(normalizedProviderId, normalizedGeneration);
    if (!current) {
      return { removed: false, stale: false };
    }

    providers.delete(normalizedProviderId);
    emit({ type: "removed", providerId: normalizedProviderId });
    return { removed: true, stale: false };
  }

  function search(query, { limit = DEFAULT_RESULT_LIMIT } = {}) {
    const normalizedQuery = normalizeSearchText(query);
    const numericLimit = Number(limit);
    const normalizedLimit = Number.isFinite(numericLimit)
      ? Math.max(0, Math.floor(numericLimit))
      : DEFAULT_RESULT_LIMIT;
    const matches = [];

    for (const provider of providers.values()) {
      for (const entry of provider.entries.values()) {
        if (!normalizedQuery || entry.searchText.includes(normalizedQuery)) {
          matches.push(entry);
        }
      }
    }

    matches.sort(compareEntries);
    return matches.slice(0, normalizedLimit).map(clonePublicEntry);
  }

  function resolve(resultId) {
    const normalizedResultId = normalizeOptionalValue(resultId);
    if (!normalizedResultId) {
      return null;
    }

    for (const provider of providers.values()) {
      const entry = provider.entries.get(normalizedResultId);
      if (entry) {
        return clonePublicEntry(entry);
      }
    }

    return null;
  }

  function getEntries() {
    return search("", { limit: Number.MAX_SAFE_INTEGER });
  }

  function getProviderGeneration(providerId) {
    const normalizedProviderId = normalizeOptionalValue(providerId);
    return normalizedProviderId
      ? (latestGenerationByProvider.get(normalizedProviderId) ??
          providers.get(normalizedProviderId)?.generation ??
          null)
      : null;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clear() {
    if (providers.size === 0) {
      return false;
    }

    providers.clear();
    emit({ type: "cleared", providerId: null });
    return true;
  }

  function emit(detail) {
    for (const listener of listeners) {
      listener(detail);
    }
  }

  return {
    replaceProvider,
    removeProvider,
    search,
    resolve,
    getEntries,
    getProviderGeneration,
    subscribe,
    clear,
  };
}

function buildEntries({ providerId, sourceId, sourceLabel, generation, layers, searchFields }) {
  const entries = new Map();
  const fields = normalizeSearchFields(searchFields);

  for (const layer of Array.isArray(layers) ? layers : []) {
    const layerId = resolveLayerId(layer);
    const graphics = getLayerGraphics(layer);

    for (const [graphicIndex, graphic] of graphics.entries()) {
      const attributes = graphic?.attributes ?? {};
      const label = readAttribute(attributes, ["datasetName", "productName", "name"]);
      const productKey = readAttribute(attributes, [
        "productIdentityKey",
        "featureKey",
        "productKey",
        "datasetName",
        "productName",
        "OBJECTID",
      ]);

      if (!label || !productKey) {
        continue;
      }

      const resultId = serializeResultId(providerId, productKey);
      const candidate = {
        graphic,
        layerId,
        label: String(label),
        representativeRank: createRepresentativeRank({
          layerId,
          attributes,
          graphicIndex,
        }),
      };
      const searchableValues = fields.map((fieldName) => readAttribute(attributes, [fieldName]));
      let entry = entries.get(resultId);

      if (!entry) {
        entry = {
          id: resultId,
          providerId,
          sourceId: normalizeOptionalValue(sourceId),
          sourceLabel: normalizeOptionalValue(sourceLabel),
          layerId: candidate.layerId,
          productKey: String(productKey),
          label: candidate.label,
          generation,
          graphic: candidate.graphic,
          representativeRank: candidate.representativeRank,
          searchableValues: new Set(),
        };
        entries.set(resultId, entry);
      } else if (
        compareRepresentativeRanks(candidate.representativeRank, entry.representativeRank) < 0
      ) {
        entry.layerId = candidate.layerId;
        entry.label = candidate.label;
        entry.graphic = candidate.graphic;
        entry.representativeRank = candidate.representativeRank;
      }

      addSearchableValues(entry.searchableValues, [label, sourceLabel, ...searchableValues]);
    }
  }

  for (const entry of entries.values()) {
    entry.searchText = normalizeSearchText([...entry.searchableValues].sort().join(" "));
    delete entry.searchableValues;
    delete entry.representativeRank;
  }

  return entries;
}

function createRepresentativeRank({ layerId, attributes, graphicIndex }) {
  return {
    layerId,
    objectId: normalizeOptionalValue(readAttribute(attributes, REPRESENTATIVE_OBJECT_ID_FIELDS)),
    graphicIndex,
  };
}

function compareRepresentativeRanks(left, right) {
  const layerComparison = compareStableValues(left.layerId, right.layerId);
  if (layerComparison !== 0) {
    return layerComparison;
  }

  const leftHasObjectId = left.objectId !== null;
  const rightHasObjectId = right.objectId !== null;
  if (leftHasObjectId !== rightHasObjectId) {
    return leftHasObjectId ? -1 : 1;
  }

  if (leftHasObjectId) {
    const objectIdComparison = compareStableValues(left.objectId, right.objectId);
    if (objectIdComparison !== 0) {
      return objectIdComparison;
    }
  }

  // Collection order is intentionally the final fallback when no more stable
  // committed identity is available inside the selected layer.
  return left.graphicIndex - right.graphicIndex;
}

function compareStableValues(left, right) {
  return String(left).localeCompare(String(right), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function addSearchableValues(target, values) {
  for (const value of values) {
    const normalized = normalizeOptionalValue(value);
    if (normalized) {
      target.add(normalized);
    }
  }
}

function clonePublicEntry(entry) {
  return {
    id: entry.id,
    providerId: entry.providerId,
    sourceId: entry.sourceId,
    sourceLabel: entry.sourceLabel,
    layerId: entry.layerId,
    productKey: entry.productKey,
    label: entry.label,
    generation: entry.generation,
    graphic: entry.graphic,
  };
}

function compareEntries(left, right) {
  const labelComparison = left.label.localeCompare(right.label, undefined, {
    sensitivity: "base",
    numeric: true,
  });

  if (labelComparison !== 0) {
    return labelComparison;
  }

  return left.id.localeCompare(right.id);
}

function normalizeSearchFields(searchFields) {
  const fields = Array.isArray(searchFields) ? searchFields : DEFAULT_SEARCH_FIELDS;
  return Array.from(new Set(fields.map(normalizeOptionalValue).filter(Boolean)));
}

function getLayerGraphics(layer) {
  const graphics = layer?.graphics;

  if (typeof graphics?.toArray === "function") {
    return graphics.toArray();
  }
  if (Array.isArray(graphics)) {
    return graphics;
  }

  const result = [];
  graphics?.forEach?.((graphic) => result.push(graphic));
  return result;
}

function resolveLayerId(layer) {
  return normalizeOptionalValue(layer?.appLayerId ?? layer?.customId ?? layer?.id) ?? "layer";
}

function readAttribute(attributes, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      return attributes[name];
    }
  }

  const normalizedNames = new Set(names.map(normalizeAttributeName));
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (normalizedNames.has(normalizeAttributeName(name))) {
      return value;
    }
  }

  return "";
}

function serializeResultId(providerId, productKey) {
  return JSON.stringify([providerId, String(productKey)]);
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function normalizeAttributeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function normalizeGeneration(value) {
  const generation = Number(value);
  return Number.isFinite(generation) && generation >= 0 ? generation : 0;
}

function normalizeRequiredValue(value, name) {
  const normalized = normalizeOptionalValue(value);
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function normalizeOptionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
