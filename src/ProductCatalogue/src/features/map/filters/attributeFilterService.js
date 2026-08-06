import { getAllStatuses } from "../../data/stores/statusStore.js";
import { getAllUsages } from "../../data/stores/usageStore.js";
import {
  ATTRIBUTE_FILTER_CONFIG,
  getAttributeFilterFieldDefinition,
  getCanonicalAttributeFilterFieldName,
  normalizeAttributeFilterFieldKey,
} from "./attributeFilterConfig.js";

const EMPTY_FILTER_VALUE = "__pm_empty_value__";
const FILTER_MODE = Object.freeze({
  VALUES: "values",
  RANGE: "range",
});
const DISPLAY_SCALE_FIELD_KEY = "displayscale";

export function createAttributeFilterService({
  getStatuses = getAllStatuses,
  getUsages = getAllUsages,
  legacyCompatibilityProviderId = ATTRIBUTE_FILTER_CONFIG.compatibilityProvider
    .legacySnapshotProviderId,
} = {}) {
  const providers = new Map();
  const filtersByProvider = new Map();
  const pendingSnapshotFilters = new Map();
  const snapshotProviderIds = new Set();
  const layerToProviderId = new WeakMap();
  const listeners = new Set();
  const latestGenerationByProvider = new Map();
  let snapshotApplied = false;
  const compatibilityProviderId = requireText(
    legacyCompatibilityProviderId,
    "legacyCompatibilityProviderId"
  );

  function replaceProvider({
    providerId,
    sourceId = null,
    label,
    generation = 0,
    layers = [],
    filterDefinitions = [],
    defaultExcludedValues = [],
    useLookupOptions = false,
    order = 0,
  } = {}) {
    const id = requireText(providerId, "providerId");
    const nextGeneration = normalizeGeneration(generation);
    const current = providers.get(id);
    const latestGeneration = latestGenerationByProvider.get(id);

    if (
      (latestGeneration !== undefined && nextGeneration < latestGeneration) ||
      (!current && latestGeneration !== undefined && nextGeneration === latestGeneration)
    ) {
      return { published: false, stale: true };
    }

    const definitions = normalizeProviderDefinitions(filterDefinitions);
    const providerLayers = Array.isArray(layers) ? [...layers] : [];
    const provider = {
      id,
      sourceId: optionalText(sourceId),
      label: optionalText(label) ?? id,
      generation: nextGeneration,
      layers: providerLayers,
      definitions,
      facets: buildFacets({
        layers: providerLayers,
        definitions,
        useLookupOptions,
        getStatuses,
        getUsages,
      }),
      order: Number(order) || 0,
    };

    providers.set(id, provider);
    latestGenerationByProvider.set(id, nextGeneration);
    for (const layer of providerLayers) {
      if (layer && typeof layer === "object") {
        layerToProviderId.set(layer, id);
      }
    }

    if (!current) {
      if (pendingSnapshotFilters.has(id)) {
        const pending = pendingSnapshotFilters.get(id);
        pendingSnapshotFilters.delete(id);
        filtersByProvider.set(id, cloneFilterMap(pending));
      } else if (snapshotApplied && snapshotProviderIds.has(id)) {
        filtersByProvider.delete(id);
      } else {
        applyDefaultExcludedValues(id, defaultExcludedValues);
      }
    }

    sanitizeProviderFilters(id);
    emit({
      type: current ? "provider-replaced" : "provider-added",
      providerId: id,
      generation: nextGeneration,
    });
    return { published: true, stale: false };
  }

  function removeProvider(providerId, { generation } = {}) {
    const id = optionalText(providerId);
    if (!id) {
      return { removed: false, stale: false };
    }

    const current = providers.get(id);
    const nextGeneration =
      generation == null
        ? (latestGenerationByProvider.get(id) ?? current?.generation ?? 0) + 1
        : normalizeGeneration(generation);
    const latestGeneration = latestGenerationByProvider.get(id) ?? current?.generation ?? 0;
    if (nextGeneration < latestGeneration) {
      return { removed: false, stale: true };
    }

    latestGenerationByProvider.set(id, nextGeneration);
    const removedProvider = providers.delete(id);
    const removedFilterState = clearProviderFilterState(id, {
      retainSnapshotIntent: false,
    });
    const removed = removedProvider || removedFilterState;

    if (removed) {
      emit({ type: "provider-removed", providerId: id, generation: nextGeneration });
    }
    return { removed, stale: false };
  }

  function suspendProvider(providerId, { generation } = {}) {
    const id = optionalText(providerId);
    if (!id) {
      return { suspended: false, stale: false };
    }

    const current = providers.get(id);
    const nextGeneration =
      generation == null
        ? (latestGenerationByProvider.get(id) ?? current?.generation ?? 0) + 1
        : normalizeGeneration(generation);
    const latestGeneration = latestGenerationByProvider.get(id) ?? current?.generation ?? 0;
    if (nextGeneration < latestGeneration) {
      return { suspended: false, stale: true };
    }

    latestGenerationByProvider.set(id, nextGeneration);
    if (!current) {
      return { suspended: false, stale: false };
    }

    const retainedFilters = cloneFilterMap(filtersByProvider.get(id) ?? new Map());
    providers.delete(id);
    filtersByProvider.delete(id);
    pendingSnapshotFilters.set(id, retainedFilters);
    snapshotProviderIds.add(id);
    emit({ type: "provider-suspended", providerId: id, generation: nextGeneration });
    return { suspended: true, stale: false };
  }

  function setFilter(providerId, fieldName, selectedValues, totalValuesCount) {
    const id = optionalText(providerId);
    const canonicalFieldName = canonicalField(fieldName);
    if (!id || !providers.has(id) || !canonicalFieldName) {
      return false;
    }

    const selected = new Set(Array.from(selectedValues ?? []).map(normalizeFilterValue));
    const total = Math.max(0, Number(totalValuesCount) || 0);
    const providerFilters = ensureProviderFilters(id);

    if (selected.size === total) {
      providerFilters.delete(canonicalFieldName);
    } else {
      providerFilters.set(canonicalFieldName, {
        mode: FILTER_MODE.VALUES,
        values: selected,
      });
    }

    cleanupProviderFilters(id, providerFilters);
    emit({ type: "filter-changed", providerId: id });
    return true;
  }

  function setRangeFilter(providerId, fieldName, minValue, maxValue, fullMinValue, fullMaxValue) {
    const id = optionalText(providerId);
    const canonicalFieldName = canonicalField(fieldName);
    if (!id || !providers.has(id) || !canonicalFieldName) {
      return false;
    }

    const min = toFiniteNumber(minValue);
    const max = toFiniteNumber(maxValue);
    const fullMin = toFiniteNumber(fullMinValue);
    const fullMax = toFiniteNumber(fullMaxValue);
    if (min === null || max === null || fullMin === null || fullMax === null) {
      return clearFilter(id, canonicalFieldName);
    }

    const normalizedMin = Math.min(min, max);
    const normalizedMax = Math.max(min, max);
    const providerFilters = ensureProviderFilters(id);

    if (normalizedMin <= fullMin && normalizedMax >= fullMax) {
      providerFilters.delete(canonicalFieldName);
    } else {
      providerFilters.set(canonicalFieldName, {
        mode: FILTER_MODE.RANGE,
        min: normalizedMin,
        max: normalizedMax,
      });
    }

    cleanupProviderFilters(id, providerFilters);
    emit({ type: "filter-changed", providerId: id });
    return true;
  }

  function clearFilter(providerId, fieldName) {
    const id = optionalText(providerId);
    const canonicalFieldName = canonicalField(fieldName);
    const providerFilters = id ? filtersByProvider.get(id) : null;
    if (!providerFilters || !canonicalFieldName) {
      return false;
    }

    const removed = providerFilters.delete(canonicalFieldName);
    cleanupProviderFilters(id, providerFilters);
    if (removed) {
      emit({ type: "filter-changed", providerId: id });
    }
    return removed;
  }

  function clearProvider(providerId) {
    const id = optionalText(providerId);
    const removed = id ? filtersByProvider.delete(id) : false;
    if (removed) {
      emit({ type: "filter-changed", providerId: id });
    }
    return removed;
  }

  function clearAll() {
    const knownProviderIds = new Set([
      ...providers.keys(),
      ...filtersByProvider.keys(),
      ...pendingSnapshotFilters.keys(),
      ...snapshotProviderIds,
    ]);
    let changed = false;

    for (const providerId of knownProviderIds) {
      changed = clearProviderFilterState(providerId, { retainSnapshotIntent: true }) || changed;
    }

    if (knownProviderIds.size > 0) {
      snapshotApplied = true;
    }

    if (!changed) {
      return false;
    }

    emit({ type: "filters-cleared", providerId: null });
    return true;
  }

  function getSelectedValues(providerId, fieldName) {
    const filter = filtersByProvider.get(optionalText(providerId))?.get(canonicalField(fieldName));
    return filter?.mode === FILTER_MODE.VALUES ? new Set(filter.values) : null;
  }

  function getRangeFilter(providerId, fieldName) {
    const filter = filtersByProvider.get(optionalText(providerId))?.get(canonicalField(fieldName));
    return filter?.mode === FILTER_MODE.RANGE ? { ...filter } : null;
  }

  function getActiveFilterCount(providerId = null) {
    const id = optionalText(providerId);
    if (id) {
      return filtersByProvider.get(id)?.size ?? 0;
    }

    let count = 0;
    for (const providerFilters of filtersByProvider.values()) {
      count += providerFilters.size;
    }
    return count;
  }

  function hasActiveDisplayScaleFilter() {
    for (const providerFilters of filtersByProvider.values()) {
      for (const fieldName of providerFilters.keys()) {
        if (normalizeAttributeFilterFieldKey(fieldName) === DISPLAY_SCALE_FIELD_KEY) {
          return true;
        }
      }
    }
    return false;
  }

  function getLayerIds() {
    return [...providers.values()]
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
      .map((provider) => provider.id);
  }

  function getLayerMetadata(providerId) {
    const provider = providers.get(optionalText(providerId));
    if (!provider) {
      return null;
    }

    return {
      providerId: provider.id,
      sourceId: provider.sourceId,
      label: provider.label,
      generation: provider.generation,
      totalCount: countProviderGraphics(provider),
      visibleCount: countMatchingProviderGraphics(provider),
    };
  }

  function getFilterableFields(providerId) {
    const provider = providers.get(optionalText(providerId));
    if (!provider) {
      return [];
    }

    return provider.definitions
      .filter((definition) => provider.facets.has(definition.fieldName))
      .map((definition) => definition.fieldName);
  }

  function getValuesForField(providerId, fieldName) {
    const provider = providers.get(optionalText(providerId));
    const values = provider?.facets.get(canonicalField(fieldName));
    return values ? values.map((entry) => ({ ...entry })) : [];
  }

  function matchesGraphic(graphic, layer) {
    const providerId = resolveProviderId(graphic, layer);
    const providerFilters = providerId ? filtersByProvider.get(providerId) : null;
    if (!providerFilters) {
      return true;
    }

    for (const [fieldName, filter] of providerFilters.entries()) {
      const rawValue = readAttributeValue(graphic, fieldName);
      if (filter.mode === FILTER_MODE.RANGE) {
        const numberValue = toFiniteNumber(rawValue);
        if (numberValue === null || numberValue < filter.min || numberValue > filter.max) {
          return false;
        }
        continue;
      }

      if (!filter.values.has(normalizeFilterValue(rawValue))) {
        return false;
      }
    }
    return true;
  }

  function getFilterSnapshot() {
    return {
      version: 2,
      sources: getSnapshotProviderIds().map((providerId) => ({
        providerId,
        fields: serializeFilterMap(
          filtersByProvider.get(providerId) ?? pendingSnapshotFilters.get(providerId) ?? new Map()
        ),
      })),
    };
  }

  function applyFilterSnapshot(snapshot) {
    const normalizedSnapshot = normalizeFilterSnapshot(snapshot, {
      compatibilityProviderId,
    });
    if (!normalizedSnapshot) {
      return false;
    }

    pendingSnapshotFilters.clear();
    snapshotProviderIds.clear();

    if (normalizedSnapshot.version === 2) {
      filtersByProvider.clear();
    } else {
      // Version 1 only owned the compatibility filter track. Preserve defaults
      // already applied to newer providers regardless of startup order.
      filtersByProvider.delete(compatibilityProviderId);
    }

    snapshotApplied = true;

    for (const entry of normalizedSnapshot.entries) {
      snapshotProviderIds.add(entry.providerId);
      const filters = deserializeFilterEntries(entry.fields);
      if (providers.has(entry.providerId)) {
        if (filters.size > 0) {
          filtersByProvider.set(entry.providerId, filters);
        }
        sanitizeProviderFilters(entry.providerId);
      } else {
        pendingSnapshotFilters.set(entry.providerId, filters);
      }
    }

    emit({ type: "snapshot-applied", providerId: null });
    return true;
  }

  function getSnapshotProviderIds() {
    const activeProviderIds = getLayerIds();
    const pendingProviderIds = [...pendingSnapshotFilters.keys()]
      .filter((providerId) => !providers.has(providerId))
      .sort((left, right) => left.localeCompare(right));

    return [...activeProviderIds, ...pendingProviderIds];
  }

  function getProviderGeneration(providerId) {
    const id = optionalText(providerId);
    return id
      ? (latestGenerationByProvider.get(id) ?? providers.get(id)?.generation ?? null)
      : null;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(detail) {
    for (const listener of listeners) {
      listener(detail);
    }
  }

  function ensureProviderFilters(providerId) {
    let providerFilters = filtersByProvider.get(providerId);
    if (!providerFilters) {
      providerFilters = new Map();
      filtersByProvider.set(providerId, providerFilters);
    }
    return providerFilters;
  }

  function cleanupProviderFilters(providerId, providerFilters) {
    if (providerFilters.size === 0) {
      filtersByProvider.delete(providerId);
    }
  }

  function clearProviderFilterState(providerId, { retainSnapshotIntent }) {
    const hasActiveFilters = filtersByProvider.has(providerId);
    const pendingFilters = pendingSnapshotFilters.get(providerId);
    const hasPendingFilters = pendingSnapshotFilters.has(providerId);
    let changed = false;

    if (hasActiveFilters) {
      filtersByProvider.delete(providerId);
      changed = true;
    }

    if (retainSnapshotIntent) {
      if (!snapshotProviderIds.has(providerId)) {
        snapshotProviderIds.add(providerId);
        changed = true;
      }

      if (providers.has(providerId)) {
        if (hasPendingFilters) {
          pendingSnapshotFilters.delete(providerId);
          changed = true;
        }
      } else if (!hasPendingFilters || pendingFilters.size > 0) {
        pendingSnapshotFilters.set(providerId, new Map());
        changed = true;
      }

      return changed;
    }

    if (hasPendingFilters) {
      pendingSnapshotFilters.delete(providerId);
      changed = true;
    }
    if (snapshotProviderIds.delete(providerId)) {
      changed = true;
    }

    return changed;
  }

  function resolveProviderId(graphic, layer) {
    const sourceLayer = layer ?? graphic?.layer;
    if (sourceLayer && typeof sourceLayer === "object") {
      const directProviderId = layerToProviderId.get(sourceLayer);
      if (directProviderId) {
        return directProviderId;
      }
    }

    const sourceId = optionalText(
      graphic?.attributes?.sourceId ??
        sourceLayer?.appSourceId ??
        sourceLayer?.dataSourceId ??
        sourceLayer?.sourceId
    );
    if (!sourceId) {
      return null;
    }

    return [...providers.values()].find((provider) => provider.sourceId === sourceId)?.id ?? null;
  }

  function sanitizeProviderFilters(providerId) {
    const provider = providers.get(providerId);
    const providerFilters = filtersByProvider.get(providerId);
    if (!provider || !providerFilters) {
      return;
    }

    const supportedFields = new Set(
      provider.definitions
        .filter((definition) => provider.facets.has(definition.fieldName))
        .map((definition) => definition.fieldName)
    );
    for (const fieldName of providerFilters.keys()) {
      if (!supportedFields.has(fieldName)) {
        providerFilters.delete(fieldName);
      }
    }
    cleanupProviderFilters(providerId, providerFilters);
  }

  function applyDefaultExcludedValues(providerId, defaults) {
    const provider = providers.get(providerId);
    if (!provider || !Array.isArray(defaults)) {
      return;
    }

    for (const defaultFilter of defaults) {
      const fieldName = canonicalField(defaultFilter?.fieldName);
      const values = provider.facets.get(fieldName);
      if (!fieldName || !values?.length) {
        continue;
      }

      const excluded = new Set((defaultFilter.values ?? []).map(normalizeFilterValue));
      const selectedValues = values
        .map((entry) => entry.value)
        .filter((value) => !excluded.has(normalizeFilterValue(value)));
      setFilter(providerId, fieldName, selectedValues, values.length);
    }
  }

  function countProviderGraphics(provider) {
    return provider.layers.reduce((total, layer) => total + getLayerGraphics(layer).length, 0);
  }

  function countMatchingProviderGraphics(provider) {
    let count = 0;
    for (const layer of provider.layers) {
      for (const graphic of getLayerGraphics(layer)) {
        if (matchesGraphic(graphic, layer)) {
          count += 1;
        }
      }
    }
    return count;
  }

  return {
    replaceProvider,
    removeProvider,
    suspendProvider,
    clearProvider,
    setFilter,
    setRangeFilter,
    clearFilter,
    clearAll,
    getSelectedValues,
    getRangeFilter,
    getActiveFilterCount,
    hasActiveDisplayScaleFilter,
    getLayerIds,
    getLayerMetadata,
    getFilterableFields,
    getValuesForField,
    matchesGraphic,
    getFilterSnapshot,
    applyFilterSnapshot,
    getProviderGeneration,
    subscribe,
  };
}

function buildFacets({ layers, definitions, useLookupOptions, getStatuses, getUsages }) {
  const facets = new Map();

  for (const definition of definitions) {
    const values = createLookupOptionEntries({
      definition,
      useLookupOptions,
      getStatuses,
      getUsages,
    });
    let hasConfiguredAttribute = false;
    const graphics = layers.flatMap(getLayerGraphics);

    for (const graphic of graphics) {
      const rawValue = readAttributeValue(graphic, definition.fieldName);
      if (!isEmptyAttributeValue(rawValue)) {
        hasConfiguredAttribute = true;
      }
    }

    if (!hasConfiguredAttribute && values.size === 0) {
      continue;
    }

    for (const graphic of graphics) {
      const value = normalizeFilterValue(readAttributeValue(graphic, definition.fieldName));
      const entry = values.get(value) ?? {
        value,
        label: createFallbackValueLabel(value),
        count: 0,
      };
      entry.count += 1;
      values.set(value, entry);
    }

    facets.set(definition.fieldName, [...values.values()].sort(compareValues));
  }

  return facets;
}

function createLookupOptionEntries({ definition, useLookupOptions, getStatuses, getUsages }) {
  const values = new Map();
  if (!useLookupOptions) {
    return values;
  }

  if (definition.optionSource === "productStates") {
    addLookupEntries(values, getStatuses());
  }
  if (definition.optionSource === "specificUsages") {
    addLookupEntries(values, getUsages());
  }
  return values;
}

function addLookupEntries(values, entries) {
  for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
    const value = normalizeFilterValue(entry?.Id);
    values.set(value, {
      value,
      label: String(entry?.Name ?? entry?.Id ?? ""),
      count: 0,
      sortIndex: index,
    });
  }
}

function normalizeProviderDefinitions(definitions) {
  const result = [];
  for (const item of Array.isArray(definitions) ? definitions : []) {
    const requestedFieldName = typeof item === "string" ? item : item?.fieldName;
    const fieldName = canonicalField(requestedFieldName);
    if (!fieldName || result.some((definition) => definition.fieldName === fieldName)) {
      continue;
    }

    result.push({
      ...getAttributeFilterFieldDefinition(fieldName),
      ...(typeof item === "object" ? item : {}),
      fieldName,
    });
  }
  return result;
}

function normalizeFilterSnapshot(snapshot, { compatibilityProviderId }) {
  if (snapshot?.version === 2 && Array.isArray(snapshot.sources)) {
    const providerIds = new Set();
    const entries = [];

    for (const entry of snapshot.sources) {
      const providerId = optionalText(entry?.providerId);
      if (
        !providerId ||
        providerIds.has(providerId) ||
        !isValidSnapshotFieldEntries(entry?.fields)
      ) {
        return null;
      }

      providerIds.add(providerId);
      entries.push({ providerId, fields: entry.fields });
    }

    return { version: 2, entries };
  }

  if (snapshot?.version === 1 && Array.isArray(snapshot.layers)) {
    const compatibilityFields = [];

    for (const entry of snapshot.layers) {
      const layerId = optionalText(entry?.layerId);
      if (layerId !== compatibilityProviderId || !isValidSnapshotFieldEntries(entry?.fields)) {
        return null;
      }

      compatibilityFields.push(...entry.fields);
    }

    // Version 1 serialized only active layer filters. An empty layers array was
    // therefore an explicit Clear all and must suppress compatibility defaults.
    return {
      version: 1,
      entries: [
        {
          providerId: compatibilityProviderId,
          fields: compatibilityFields,
        },
      ],
    };
  }

  return null;
}

function isValidSnapshotFieldEntries(fields) {
  if (!Array.isArray(fields)) {
    return false;
  }

  return fields.every((entry) => {
    if (!canonicalField(entry?.fieldName)) {
      return false;
    }

    if (entry.mode === FILTER_MODE.VALUES) {
      return Array.isArray(entry.values);
    }

    if (entry.mode === FILTER_MODE.RANGE) {
      return toFiniteNumber(entry.min) !== null && toFiniteNumber(entry.max) !== null;
    }

    return false;
  });
}

function serializeFilterMap(filterMap) {
  const fields = [];
  for (const [fieldName, filter] of filterMap.entries()) {
    fields.push(
      filter.mode === FILTER_MODE.RANGE
        ? { fieldName, mode: FILTER_MODE.RANGE, min: filter.min, max: filter.max }
        : { fieldName, mode: FILTER_MODE.VALUES, values: [...filter.values] }
    );
  }
  return fields;
}

function deserializeFilterEntries(fields) {
  const result = new Map();
  for (const entry of Array.isArray(fields) ? fields : []) {
    const fieldName = canonicalField(entry?.fieldName);
    if (!fieldName) {
      continue;
    }

    if (entry.mode === FILTER_MODE.RANGE) {
      const min = toFiniteNumber(entry.min);
      const max = toFiniteNumber(entry.max);
      if (min !== null && max !== null) {
        result.set(fieldName, {
          mode: FILTER_MODE.RANGE,
          min: Math.min(min, max),
          max: Math.max(min, max),
        });
      }
      continue;
    }

    if (entry.mode === FILTER_MODE.VALUES && Array.isArray(entry.values)) {
      result.set(fieldName, {
        mode: FILTER_MODE.VALUES,
        values: new Set(entry.values.map(normalizeFilterValue)),
      });
    }
  }
  return result;
}

function cloneFilterMap(filterMap) {
  const clone = new Map();
  for (const [fieldName, filter] of filterMap.entries()) {
    clone.set(
      fieldName,
      filter.mode === FILTER_MODE.RANGE
        ? { ...filter }
        : { mode: FILTER_MODE.VALUES, values: new Set(filter.values) }
    );
  }
  return clone;
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

function readAttributeValue(graphic, fieldName) {
  const attributes = graphic?.attributes ?? {};
  const definition = getAttributeFilterFieldDefinition(fieldName);
  const candidateNames = [fieldName, definition?.fieldName, ...(definition?.aliases ?? [])].filter(
    Boolean
  );

  for (const candidateName of candidateNames) {
    if (Object.prototype.hasOwnProperty.call(attributes, candidateName)) {
      return attributes[candidateName];
    }
  }

  const normalizedFieldName = normalizeAttributeFilterFieldKey(fieldName);
  for (const [candidateName, candidateValue] of Object.entries(attributes)) {
    if (normalizeAttributeFilterFieldKey(candidateName) === normalizedFieldName) {
      return candidateValue;
    }
  }
  return undefined;
}

function normalizeFilterValue(value) {
  return isEmptyAttributeValue(value) ? EMPTY_FILTER_VALUE : String(value);
}

function toFiniteNumber(value) {
  if (isEmptyAttributeValue(value)) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareValues(left, right) {
  if (Number.isFinite(left.sortIndex) && Number.isFinite(right.sortIndex)) {
    return left.sortIndex - right.sortIndex;
  }
  if (Number.isFinite(left.sortIndex)) {
    return -1;
  }
  if (Number.isFinite(right.sortIndex)) {
    return 1;
  }

  const leftNumber = Number(left.value);
  const rightNumber = Number(right.value);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.label.localeCompare(right.label, undefined, { numeric: true });
}

function canonicalField(fieldName) {
  return getCanonicalAttributeFilterFieldName(fieldName) ?? null;
}

function createFallbackValueLabel(value) {
  return value === EMPTY_FILTER_VALUE ? "(empty)" : String(value);
}

function isEmptyAttributeValue(value) {
  return value === null || value === undefined || value === "";
}

function normalizeGeneration(value) {
  const generation = Number(value);
  return Number.isFinite(generation) && generation >= 0 ? generation : 0;
}

function requireText(value, name) {
  const normalized = optionalText(value);
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
