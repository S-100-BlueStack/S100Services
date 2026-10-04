import { layerSupportsCapability } from "../../map/config/layerDefinitions.js";

export function createDataSourceDerivedStateCoordinator({
  lifecycle,
  filterService,
  productSearchIndex,
} = {}) {
  const unsubscribers = [
    lifecycle?.subscribe?.("activated", publishSource),
    lifecycle?.subscribe?.("refreshed", publishSource),
    lifecycle?.subscribe?.("deactivating", handleDeactivating),
  ].filter(Boolean);

  function publishSource({ source, sourceId, generation, layers } = {}) {
    if (!source || !sourceId) {
      return;
    }

    const committedLayers = Array.isArray(layers) ? layers : [];
    const filterLayers = committedLayers.filter((layer) =>
      layerSupportsCapability(layer, "supportsAttributeFilters")
    );
    const searchLayers = committedLayers.filter((layer) =>
      layerSupportsCapability(layer, "supportsProductSearch")
    );

    if (source.filtering?.supported) {
      filterService?.replaceProvider?.({
        providerId: sourceId,
        sourceId,
        label: source.label,
        generation,
        layers: filterLayers,
        filterDefinitions: source.filtering.definitions,
        defaultExcludedValues: source.filtering.defaultExcludedValues,
        useLookupOptions: source.filtering.useLookupOptions,
        order: source.filtering.order ?? 100,
      });
    }

    if (source.search?.supported && source.capabilities?.productSearch) {
      productSearchIndex?.replaceProvider?.({
        providerId: sourceId,
        sourceId,
        sourceLabel: source.label,
        generation,
        layers: searchLayers,
        searchFields: source.search.fields,
      });
    }
  }

  function handleDeactivating({ sourceId, generation, reason } = {}) {
    if (!sourceId) {
      return;
    }

    const effectiveGeneration = resolveGeneration(sourceId, generation);

    if (reason === "activation-failed") {
      filterService?.suspendProvider?.(sourceId, { generation: effectiveGeneration });
      productSearchIndex?.removeProvider?.(sourceId, { generation: effectiveGeneration });
      return;
    }

    filterService?.removeProvider?.(sourceId, { generation: effectiveGeneration });
    productSearchIndex?.removeProvider?.(sourceId, { generation: effectiveGeneration });
  }

  function resolveGeneration(sourceId, generation) {
    if (generation != null) {
      return generation;
    }

    const filterGeneration = filterService?.getProviderGeneration?.(sourceId) ?? 0;
    const searchGeneration = productSearchIndex?.getProviderGeneration?.(sourceId) ?? 0;
    return Math.max(filterGeneration, searchGeneration) + 1;
  }

  return {
    destroy() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
}
