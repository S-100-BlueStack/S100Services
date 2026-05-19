import { getAllLayers } from "../core/layerRegistry.js";

const EXCLUDED_FIELDS = new Set(["datasetName"]);
const EMPTY_FILTER_VALUE = "__pm_empty_value__";

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

function compareValues(a, b) {
  const aNumber = Number(a.value);
  const bNumber = Number(b.value);

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber;
  }

  return a.label.localeCompare(b.label);
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

  function setFilter(layerId, fieldName, selectedValues, totalValuesCount) {
    const normalizedValues = new Set(Array.from(selectedValues ?? []).map(normalizeFilterValue));

    const layerFilters = ensureLayerFilters(layerId);

    if (normalizedValues.size === totalValuesCount) {
      layerFilters.delete(fieldName);
    } else {
      layerFilters.set(fieldName, normalizedValues);
    }

    if (layerFilters.size === 0) {
      filtersByLayer.delete(layerId);
    }
  }

  function clearFilter(layerId, fieldName) {
    const layerFilters = filtersByLayer.get(layerId);

    if (!layerFilters) {
      return;
    }

    layerFilters.delete(fieldName);

    if (layerFilters.size === 0) {
      filtersByLayer.delete(layerId);
    }
  }

  function clearAll() {
    filtersByLayer.clear();
  }

  function getSelectedValues(layerId, fieldName) {
    return filtersByLayer.get(layerId)?.get(fieldName) ?? null;
  }

  function getActiveFilterCount() {
    let count = 0;

    for (const layerFilters of filtersByLayer.values()) {
      count += layerFilters.size;
    }

    return count;
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

    for (const [fieldName, selectedValues] of layerFilters.entries()) {
      const value = normalizeFilterValue(graphic.attributes?.[fieldName]);

      if (!selectedValues.has(value)) {
        return false;
      }
    }

    return true;
  }

  return {
    setFilter,
    clearFilter,
    clearAll,
    getSelectedValues,
    getActiveFilterCount,
    getLayerIds,
    getFilterableFields,
    getValuesForField,
    matchesGraphic,
  };
}
