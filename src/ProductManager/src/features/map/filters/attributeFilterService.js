import { getAllLayers } from "../core/layerRegistry.js";

const EXCLUDED_FIELDS = new Set(["datasetName", "featureKey"]);
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
  const aNumber = Number(a.value);
  const bNumber = Number(b.value);

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber;
  }

  return a.label.localeCompare(b.label);
}

function normalizeFieldKey(fieldName) {
  return String(fieldName ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function getSourceLayers(layerId) {
  const layers = getAllLayers().filter((layer) => getLayerId(layer) === layerId);
  const detailLayers = layers.filter((layer) => layer.appLayerRole === "detail");

  // If overview/detail layers contain duplicate features, count only the detail layer.
  return detailLayers.length ? detailLayers : layers;
}

function isFilterableField(fieldName) {
  return fieldName && !EXCLUDED_FIELDS.has(fieldName);
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
        if (!isFilterableField(fieldEntry?.fieldName)) {
          continue;
        }

        if (fieldEntry.mode === FILTER_MODE.RANGE) {
          const min = toFiniteNumber(fieldEntry.min);
          const max = toFiniteNumber(fieldEntry.max);

          if (min === null || max === null) {
            continue;
          }

          layerFilters.set(fieldEntry.fieldName, {
            mode: FILTER_MODE.RANGE,
            min: Math.min(min, max),
            max: Math.max(min, max),
          });

          continue;
        }

        if (fieldEntry.mode === FILTER_MODE.VALUES && Array.isArray(fieldEntry.values)) {
          layerFilters.set(fieldEntry.fieldName, {
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
    const normalizedValues = new Set(Array.from(selectedValues ?? []).map(normalizeFilterValue));
    const layerFilters = ensureLayerFilters(layerId);

    if (normalizedValues.size === totalValuesCount) {
      layerFilters.delete(fieldName);
    } else {
      layerFilters.set(fieldName, {
        mode: FILTER_MODE.VALUES,
        values: normalizedValues,
      });
    }

    cleanupLayerFilters(layerId, layerFilters);
  }

  function setRangeFilter(layerId, fieldName, minValue, maxValue, fullMinValue, fullMaxValue) {
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
      clearFilter(layerId, fieldName);
      return;
    }

    const normalizedMin = Math.min(minNumber, maxNumber);
    const normalizedMax = Math.max(minNumber, maxNumber);
    const layerFilters = ensureLayerFilters(layerId);

    if (normalizedMin <= fullMinNumber && normalizedMax >= fullMaxNumber) {
      layerFilters.delete(fieldName);
    } else {
      layerFilters.set(fieldName, {
        mode: FILTER_MODE.RANGE,
        min: normalizedMin,
        max: normalizedMax,
      });
    }

    cleanupLayerFilters(layerId, layerFilters);
  }

  function clearFilter(layerId, fieldName) {
    const layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      return;
    }

    layerFilters.delete(fieldName);
    cleanupLayerFilters(layerId, layerFilters);
  }

  function clearAll() {
    filtersByLayer.clear();
  }

  function getSelectedValues(layerId, fieldName) {
    const filter = filtersByLayer.get(layerId)?.get(fieldName);

    return filter?.mode === FILTER_MODE.VALUES ? filter.values : null;
  }

  function getRangeFilter(layerId, fieldName) {
    const filter = filtersByLayer.get(layerId)?.get(fieldName);

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
      const layerId = getLayerId(layer);

      if (layerId) {
        layerIds.add(layerId);
      }
    }

    return Array.from(layerIds).sort();
  }

  function getFilterableFields(layerId) {
    const fields = new Set();

    for (const layer of getSourceLayers(layerId)) {
      for (const graphic of getLayerGraphics(layer)) {
        for (const fieldName of Object.keys(graphic.attributes ?? {})) {
          if (isFilterableField(fieldName)) {
            fields.add(fieldName);
          }
        }
      }
    }

    return Array.from(fields).sort((a, b) => a.localeCompare(b));
  }

  function getValuesForField(layerId, fieldName) {
    const values = new Map();

    for (const layer of getSourceLayers(layerId)) {
      for (const graphic of getLayerGraphics(layer)) {
        const value = normalizeFilterValue(graphic.attributes?.[fieldName]);
        const label = value === EMPTY_FILTER_VALUE ? "(empty)" : value;
        const entry = values.get(value) ?? { value, label, count: 0 };

        entry.count += 1;
        values.set(value, entry);
      }
    }

    return Array.from(values.values()).sort(compareValues);
  }

  function matchesGraphic(graphic, layer) {
    const layerId = getLayerId(layer ?? graphic?.layer);
    const layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      return true;
    }

    for (const [fieldName, filter] of layerFilters.entries()) {
      const rawValue = graphic.attributes?.[fieldName];

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
