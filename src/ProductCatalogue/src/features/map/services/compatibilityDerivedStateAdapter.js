import { PRODUCT_CORRECTIONS_LAYER_ID, getLayerDefinition } from "../config/layerDefinitions.js";
import { ATTRIBUTE_FILTER_CONFIG } from "../filters/attributeFilterConfig.js";

export function createCompatibilityDerivedStateAdapter({ filterService, productSearchIndex } = {}) {
  let generation = 0;

  function replace(layers = []) {
    generation += 1;
    const compatibilityLayers = (Array.isArray(layers) ? layers : []).filter(isCompatibilityLayer);

    if (compatibilityLayers.length === 0) {
      filterService?.removeProvider?.(PRODUCT_CORRECTIONS_LAYER_ID, { generation });
      productSearchIndex?.removeProvider?.(PRODUCT_CORRECTIONS_LAYER_ID, { generation });
      return { generation, count: 0 };
    }

    const definition = getLayerDefinition(PRODUCT_CORRECTIONS_LAYER_ID);
    filterService?.replaceProvider?.({
      providerId: PRODUCT_CORRECTIONS_LAYER_ID,
      sourceId: null,
      label: definition?.displayName ?? "Product corrections",
      generation,
      layers: compatibilityLayers,
      filterDefinitions: ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.filterDefinitions,
      defaultExcludedValues: ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.defaultExcludedValues,
      useLookupOptions: ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.useLookupOptions,
      order: 0,
    });
    productSearchIndex?.replaceProvider?.({
      providerId: PRODUCT_CORRECTIONS_LAYER_ID,
      sourceId: null,
      sourceLabel: definition?.displayName ?? "Product corrections",
      generation,
      layers: compatibilityLayers,
      searchFields: ["datasetName", "productName", "productKey"],
    });

    return { generation, count: compatibilityLayers.length };
  }

  function clear() {
    generation += 1;
    filterService?.removeProvider?.(PRODUCT_CORRECTIONS_LAYER_ID, { generation });
    productSearchIndex?.removeProvider?.(PRODUCT_CORRECTIONS_LAYER_ID, { generation });
  }

  return {
    replace,
    clear,
    getGeneration: () => generation,
  };
}

function isCompatibilityLayer(layer) {
  const layerId = layer?.appLayerId ?? layer?.customId ?? layer?.id ?? null;
  const sourceId = layer?.appSourceId ?? layer?.dataSourceId ?? layer?.sourceId ?? null;
  return layerId === PRODUCT_CORRECTIONS_LAYER_ID && !sourceId;
}
