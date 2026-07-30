import { getAllStatuses } from "../../data/stores/statusStore.js";
import { getAllUsages } from "../../data/stores/usageStore.js";
import { getAllLayers } from "../core/layerRegistry.js";
import { layerSupportsCapability } from "../config/layerDefinitions.js";
import {
  getAttributeFilterFieldDefinition,
  getAttributeFilterFieldDefinitions,
  getCanonicalAttributeFilterFieldName,
  isConfiguredAttributeFilterField,
  normalizeAttributeFilterFieldKey,
} from "./attributeFilterConfig.js";

const EMPTY_FILTER_VALUE = "__pm_empty_value__";
const FILTER_MODE = {
  VALUES: "values",
  RANGE: "range",
};

const DISPLAY_SCALE_FIELD_KEY = "displayscale";

function getLayerId(layer) {
  return layer?.appLayerId ?? layer?.customId ?? layer?.id ?? layer?.title ?? null;
}

function getLayerGraphics(layer) {
  return layer?.graphics?.toArray?.() ?? [];
}

function normalizeFilterValue(value) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_FILTER_VALUE;
  }

  return String(value);
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function compareValues(a, b) {
  if (Number.isFinite(a.sortIndex) && Number.isFinite(b.sortIndex)) {
    return a.sortIndex - b.sortIndex;
  }

  if (Number.isFinite(a.sortIndex)) {
    return -1;
  }

  if (Number.isFinite(b.sortIndex)) {
    return 1;
  }

  const aNumber = Number(a.value);
  const bNumber = Number(b.value);

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber;
  }

  return a.label.localeCompare(b.label);
}

function normalizeFieldKey(fieldName) {
  return normalizeAttributeFilterFieldKey(fieldName);
}

function getSourceLayers(layerId) {
  return getAllLayers().filter((layer) => {
    return getLayerId(layer) === layerId && isLayerFilterable(layer);
  });
}

function isLayerFilterable(layer) {
  return layerSupportsCapability(layer, "supportsAttributeFilters");
}

function isFilterableField(fieldName) {
  return isConfiguredAttributeFilterField(fieldName);
}

export function createAttributeFilterService() {
  const filtersByLayer = new Map();

  function ensureLayerFilters(layerId) {
    let layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      layerFilters = new Map();
      filtersByLayer.set(layerId, layerFilters);
    }

    return layerFilters;
  }

  function cleanupLayerFilters(layerId, layerFilters) {
    if (layerFilters.size === 0) {
      filtersByLayer.delete(layerId);
    }
  }

  function getFilterSnapshot() {
    const layers = [];

    for (const [layerId, layerFilters] of filtersByLayer.entries()) {
      const fields = [];

      for (const [fieldName, filter] of layerFilters.entries()) {
        if (filter.mode === FILTER_MODE.RANGE) {
          fields.push({
            fieldName,
            mode: FILTER_MODE.RANGE,
            min: filter.min,
            max: filter.max,
          });
          continue;
        }

        fields.push({
          fieldName,
          mode: FILTER_MODE.VALUES,
          values: Array.from(filter.values),
        });
      }

      if (fields.length) {
        layers.push({ layerId, fields });
      }
    }

    return {
      version: 1,
      layers,
    };
  }

  function applyFilterSnapshot(snapshot) {
    filtersByLayer.clear();

    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.layers)) {
      return false;
    }

    for (const layerEntry of snapshot.layers) {
      if (!layerEntry?.layerId || !Array.isArray(layerEntry.fields)) {
        continue;
      }

      const layerFilters = ensureLayerFilters(layerEntry.layerId);

      for (const fieldEntry of layerEntry.fields) {
        const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldEntry?.fieldName);

        if (!canonicalFieldName) {
          continue;
        }

        if (fieldEntry.mode === FILTER_MODE.RANGE) {
          const min = toFiniteNumber(fieldEntry.min);
          const max = toFiniteNumber(fieldEntry.max);

          if (min === null || max === null) {
            continue;
          }

          layerFilters.set(canonicalFieldName, {
            mode: FILTER_MODE.RANGE,
            min: Math.min(min, max),
            max: Math.max(min, max),
          });
          continue;
        }

        if (fieldEntry.mode === FILTER_MODE.VALUES && Array.isArray(fieldEntry.values)) {
          layerFilters.set(canonicalFieldName, {
            mode: FILTER_MODE.VALUES,
            values: new Set(fieldEntry.values.map(normalizeFilterValue)),
          });
        }
      }

      cleanupLayerFilters(layerEntry.layerId, layerFilters);
    }

    return true;
  }

  function setFilter(layerId, fieldName, selectedValues, totalValuesCount) {
    const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldName) ?? fieldName;
    const normalizedValues = new Set(Array.from(selectedValues ?? []).map(normalizeFilterValue));
    const layerFilters = ensureLayerFilters(layerId);

    if (normalizedValues.size === totalValuesCount) {
      layerFilters.delete(canonicalFieldName);
    } else {
      layerFilters.set(canonicalFieldName, {
        mode: FILTER_MODE.VALUES,
        values: normalizedValues,
      });
    }

    cleanupLayerFilters(layerId, layerFilters);
  }

  function setRangeFilter(layerId, fieldName, minValue, maxValue, fullMinValue, fullMaxValue) {
    const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldName) ?? fieldName;
    const minNumber = toFiniteNumber(minValue);
    const maxNumber = toFiniteNumber(maxValue);
    const fullMinNumber = toFiniteNumber(fullMinValue);
    const fullMaxNumber = toFiniteNumber(fullMaxValue);

    if (
      minNumber === null ||
      maxNumber === null ||
      fullMinNumber === null ||
      fullMaxNumber === null
    ) {
      clearFilter(layerId, canonicalFieldName);
      return;
    }

    const normalizedMin = Math.min(minNumber, maxNumber);
    const normalizedMax = Math.max(minNumber, maxNumber);
    const layerFilters = ensureLayerFilters(layerId);

    if (normalizedMin <= fullMinNumber && normalizedMax >= fullMaxNumber) {
      layerFilters.delete(canonicalFieldName);
    } else {
      layerFilters.set(canonicalFieldName, {
        mode: FILTER_MODE.RANGE,
        min: normalizedMin,
        max: normalizedMax,
      });
    }

    cleanupLayerFilters(layerId, layerFilters);
  }

  function clearFilter(layerId, fieldName) {
    const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldName) ?? fieldName;
    const layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      return;
    }

    layerFilters.delete(canonicalFieldName);
    cleanupLayerFilters(layerId, layerFilters);
  }

  function clearAll() {
    filtersByLayer.clear();
  }

  function getSelectedValues(layerId, fieldName) {
    const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldName) ?? fieldName;
    const filter = filtersByLayer.get(layerId)?.get(canonicalFieldName);

    return filter?.mode === FILTER_MODE.VALUES ? filter.values : null;
  }

  function getRangeFilter(layerId, fieldName) {
    const canonicalFieldName = getCanonicalAttributeFilterFieldName(fieldName) ?? fieldName;
    const filter = filtersByLayer.get(layerId)?.get(canonicalFieldName);

    return filter?.mode === FILTER_MODE.RANGE ? filter : null;
  }

  function getActiveFilterCount() {
    let count = 0;

    for (const layerFilters of filtersByLayer.values()) {
      count += layerFilters.size;
    }

    return count;
  }

  function hasActiveDisplayScaleFilter() {
    for (const layerFilters of filtersByLayer.values()) {
      for (const fieldName of layerFilters.keys()) {
        if (normalizeFieldKey(fieldName) === DISPLAY_SCALE_FIELD_KEY) {
          return true;
        }
      }
    }

    return false;
  }

  function getLayerIds() {
    const layerIds = new Set();

    for (const layer of getAllLayers()) {
      if (!isLayerFilterable(layer)) {
        continue;
      }

      const layerId = getLayerId(layer);

      if (layerId) {
        layerIds.add(layerId);
      }
    }

    return Array.from(layerIds).sort();
  }

  function getFilterableFields(layerId) {
    const availableFieldKeys = collectAvailableFieldKeys(layerId);

    return getAttributeFilterFieldDefinitions()
      .filter((definition) => {
        if (availableFieldKeys.has(normalizeFieldKey(definition.fieldName))) {
          return true;
        }

        // Status is authoritative metadata from the lookup endpoint. Show the
        // full status list even when no visible feature currently uses a value.
        return definition.optionSource === "productStates" && getAllStatuses().length > 0;
      })
      .map((definition) => definition.fieldName);
  }

  function getValuesForField(layerId, fieldName) {
    const definition = getAttributeFilterFieldDefinition(fieldName);
    const values = createLookupOptionEntries(definition);

    for (const layer of getSourceLayers(layerId)) {
      for (const graphic of getLayerGraphics(layer)) {
        const value = normalizeFilterValue(readAttributeValue(graphic, fieldName));
        const entry = values.get(value) ?? {
          value,
          label: createFallbackValueLabel(value),
          count: 0,
        };

        entry.count += 1;
        values.set(value, entry);
      }
    }

    return Array.from(values.values()).sort(compareValues);
  }

  function matchesGraphic(graphic, layer) {
    const sourceLayer = layer ?? graphic?.layer;

    if (!isLayerFilterable(sourceLayer)) {
      return true;
    }

    const layerId = getLayerId(sourceLayer);
    const layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      return true;
    }

    for (const [fieldName, filter] of layerFilters.entries()) {
      const rawValue = readAttributeValue(graphic, fieldName);

      if (filter.mode === FILTER_MODE.RANGE) {
        const numberValue = toFiniteNumber(rawValue);

        // Missing or non-numeric values should not match an active numeric range.
        if (numberValue === null || numberValue < filter.min || numberValue > filter.max) {
          return false;
        }

        continue;
      }

      const value = normalizeFilterValue(rawValue);

      if (!filter.values.has(value)) {
        return false;
      }
    }

    return true;
  }

  return {
    setFilter,
    setRangeFilter,
    clearFilter,
    clearAll,
    getSelectedValues,
    getRangeFilter,
    getActiveFilterCount,
    hasActiveDisplayScaleFilter,
    getLayerIds,
    getFilterableFields,
    getValuesForField,
    matchesGraphic,
    getFilterSnapshot,
    applyFilterSnapshot,
  };
}

function collectAvailableFieldKeys(layerId) {
  const fieldKeys = new Set();

  for (const layer of getSourceLayers(layerId)) {
    for (const graphic of getLayerGraphics(layer)) {
      for (const fieldName of Object.keys(graphic.attributes ?? {})) {
        if (!isFilterableField(fieldName)) {
          continue;
        }

        fieldKeys.add(normalizeFieldKey(fieldName));
      }
    }
  }

  return fieldKeys;
}

function createLookupOptionEntries(definition) {
  const values = new Map();

  if (definition?.optionSource === "productStates") {
    addLookupEntries(values, getAllStatuses());
  }

  if (definition?.optionSource === "specificUsages") {
    addLookupEntries(values, getAllUsages());
  }

  return values;
}

function addLookupEntries(values, entries) {
  entries.forEach((entry, index) => {
    const value = normalizeFilterValue(entry.Id);
    values.set(value, {
      value,
      label: String(entry.Name ?? entry.Id ?? ""),
      count: 0,
      sortIndex: index,
    });
  });
}

function readAttributeValue(graphic, fieldName) {
  const attributes = graphic.attributes ?? {};
  const definition = getAttributeFilterFieldDefinition(fieldName);
  const candidateFieldNames = [
    fieldName,
    definition?.fieldName,
    ...(definition?.aliases ?? []),
  ].filter(Boolean);

  for (const candidateName of candidateFieldNames) {
    const exactValue = attributes[candidateName];

    if (!isEmptyAttributeValue(exactValue)) {
      return exactValue;
    }
  }

  const normalizedFieldName = normalizeFieldKey(fieldName);

  for (const [candidateName, candidateValue] of Object.entries(attributes)) {
    if (
      normalizeFieldKey(candidateName) === normalizedFieldName &&
      !isEmptyAttributeValue(candidateValue)
    ) {
      return candidateValue;
    }
  }

  return attributes[fieldName];
}

function createFallbackValueLabel(value) {
  return value === EMPTY_FILTER_VALUE ? "(empty)" : value;
}

function isEmptyAttributeValue(value) {
  return value === null || value === undefined || value === "";
}
