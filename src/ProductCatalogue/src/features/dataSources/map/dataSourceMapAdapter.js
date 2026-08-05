import { getLayer, registerLayer, unregisterLayer } from "../../map/core/layerRegistry.js";

export function createDataSourceMapAdapter({
  map,
  hoverManager,
  createLayer,
  layerRegistry = { getLayer, registerLayer, unregisterLayer },
} = {}) {
  const sourceLayers = new Map();
  const stagingMap = Object.freeze({ add() {} });

  async function prepareSource({ source, normalized, generation }) {
    const candidateLayers = [];
    const normalizedLayersById = new Map(
      (normalized?.layers ?? []).map((layer) => [layer.layerId, layer])
    );

    try {
      for (const layerDefinition of source.layerDefinitions ?? []) {
        const normalizedLayer = normalizedLayersById.get(layerDefinition.id);
        if (!normalizedLayer) {
          throw new Error(
            `Data source "${source.label}" did not produce payload for layer ` +
              `"${layerDefinition.id}".`
          );
        }

        const layer = await createLayer(stagingMap, {
          ...layerDefinition,
          data: normalizedLayer.data,
        });

        if (!layer) {
          throw new Error(
            `Data source "${source.label}" did not create layer "${layerDefinition.id}".`
          );
        }

        applySourceMetadata(layer, source);
        validateCandidateLayer(layer, source);
        candidateLayers.push(layer);
      }

      if (candidateLayers.length !== (source.layerDefinitions?.length ?? 0)) {
        throw new Error(`Data source "${source.label}" produced an incomplete layer candidate.`);
      }

      return {
        sourceId: source.id,
        generation,
        layers: candidateLayers,
        committed: false,
        discarded: false,
      };
    } catch (error) {
      destroyLayers(candidateLayers);
      throw error;
    }
  }

  function commitSource(candidate, { isCurrent } = {}) {
    if (!candidate || candidate.discarded || candidate.committed) {
      return { committed: false, reason: "invalid-candidate" };
    }

    if (!isCurrent?.()) {
      return { committed: false, reason: "stale-candidate" };
    }

    const previousLayers = sourceLayers.get(candidate.sourceId) ?? [];
    const addedLayers = [];

    try {
      for (const layer of candidate.layers) {
        layer.visible = false;
        map.add(layer);
        addedLayers.push(layer);
        layerRegistry.registerLayer(layer);
      }

      // Map and registry changes above are synchronous, but checking again keeps
      // re-entrant map observers from publishing a candidate invalidated by reset.
      if (!isCurrent()) {
        rollbackCandidateRegistration(candidate, previousLayers, addedLayers);
        return { committed: false, reason: "stale-candidate" };
      }

      for (const layer of candidate.layers) {
        layer.visible = true;
      }

      sourceLayers.set(candidate.sourceId, [...candidate.layers]);
      const hoverReady = Promise.allSettled(
        candidate.layers.map((layer) => hoverManager?.registerLayer?.(layer))
      );

      for (const previousLayer of previousLayers) {
        hoverManager?.unregisterLayer?.(previousLayer);
        layerRegistry.unregisterLayer(previousLayer);
        map.remove(previousLayer);
      }
      destroyLayers(previousLayers);

      candidate.committed = true;
      return {
        committed: true,
        layers: [...candidate.layers],
        hoverReady,
      };
    } catch (error) {
      rollbackCandidateRegistration(candidate, previousLayers, addedLayers);
      throw error;
    }
  }

  function removeSource(sourceId) {
    const layers = sourceLayers.get(sourceId) ?? [];
    sourceLayers.delete(sourceId);

    for (const layer of layers) {
      hoverManager?.unregisterLayer?.(layer);
      layerRegistry.unregisterLayer(layer);
      map.remove(layer);
    }

    destroyLayers(layers);
    return layers.length;
  }

  function discardCandidate(candidate) {
    if (!candidate || candidate.committed || candidate.discarded) {
      return false;
    }

    candidate.discarded = true;
    destroyLayers(candidate.layers);
    return true;
  }

  function getSourceLayers(sourceId) {
    return [...(sourceLayers.get(sourceId) ?? [])];
  }

  function isSourceRendered(sourceId) {
    const layers = sourceLayers.get(sourceId) ?? [];
    return (
      layers.length > 0 &&
      layers.every((layer) => mapContainsLayer(map, layer) && getRegisteredLayer(layer) === layer)
    );
  }

  function getRegisteredLayer(layer) {
    return layerRegistry.getLayer?.(layer.customId) ?? null;
  }

  function rollbackCandidateRegistration(candidate, previousLayers, addedLayers) {
    let rollbackError = null;

    try {
      for (const layer of addedLayers) {
        try {
          hoverManager?.unregisterLayer?.(layer);
          layerRegistry.unregisterLayer(layer);
          map.remove(layer);
        } catch (error) {
          rollbackError ??= error;
        }
      }

      for (const previousLayer of previousLayers) {
        try {
          if (!mapContainsLayer(map, previousLayer)) {
            map.add(previousLayer);
          }
          previousLayer.visible = true;
          layerRegistry.registerLayer(previousLayer);
          void hoverManager?.registerLayer?.(previousLayer);
        } catch (error) {
          rollbackError ??= error;
        }
      }

      sourceLayers.set(candidate.sourceId, [...previousLayers]);
    } finally {
      // Candidate cleanup must not depend on successful rollback bookkeeping.
      candidate.discarded = true;
      destroyLayers(addedLayers);
    }

    if (rollbackError) {
      console.error("[Data sources] Candidate rollback was incomplete.", rollbackError);
    }
  }

  return {
    prepareSource,
    commitSource,
    removeSource,
    discardCandidate,
    getSourceLayers,
    isSourceRendered,
  };
}

function applySourceMetadata(layer, source) {
  layer.appSourceId = source.id;
  layer.dataSourceId = source.id;
  layer.sourceId = source.id;
  layer.visible = false;
  layer.popupEnabled = Boolean(
    layer.appLayerCapabilities?.supportsPopup ??
    source.layerDefinitions?.find((definition) => definition.id === layer.customId)?.capabilities
      ?.supportsPopup
  );

  if (layer.popupEnabled) {
    layer.popupTemplate = createSafeSourcePopupTemplate(source);
  } else {
    layer.popupTemplate = null;
  }
}

function createSafeSourcePopupTemplate(source) {
  return {
    title: `${source.label}: {datasetName}`,
    outFields: ["*"],
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "sourceLabel", label: "Source" },
          { fieldName: "datasetName", label: "Product" },
          { fieldName: "edition", label: "Edition" },
          { fieldName: "update", label: "Update" },
          { fieldName: "status", label: "Status" },
          { fieldName: "displayScale", label: "Display scale" },
        ],
      },
    ],
  };
}

function validateCandidateLayer(layer, source) {
  const configuredLayer = source.layerDefinitions?.find(
    (definition) => definition.id === layer.customId
  );
  if (!configuredLayer) {
    throw new Error(`Data source "${source.label}" created unexpected layer "${layer.customId}".`);
  }

  if (layer.appSourceId !== source.id) {
    throw new Error(`Layer "${layer.customId}" has inconsistent source metadata.`);
  }

  const seenIdentities = new Set();
  for (const graphic of getGraphics(layer)) {
    const attributes = graphic?.attributes ?? {};
    if (attributes.sourceId !== source.id) {
      throw new Error(
        `Layer "${layer.customId}" contains a graphic without source metadata for "${source.id}".`
      );
    }

    const identity = String(attributes.productIdentityKey ?? "").trim();
    if (!identity) {
      throw new Error(
        `Layer "${layer.customId}" contains a graphic without a stable source-aware identity.`
      );
    }

    if (seenIdentities.has(identity)) {
      throw new Error(`Layer "${layer.customId}" contains duplicate identity ${identity}.`);
    }
    seenIdentities.add(identity);
  }
}

function getGraphics(layer) {
  return layer?.graphics?.toArray?.() ?? layer?.graphics ?? [];
}

function mapContainsLayer(map, layer) {
  if (typeof map?.layers?.includes === "function") {
    return map.layers.includes(layer);
  }

  const layers = map?.layers?.toArray?.() ?? map?.layers ?? [];
  return Array.from(layers).includes(layer);
}

function destroyLayers(layers) {
  for (const layer of layers ?? []) {
    try {
      layer.removeAll?.();
      layer.destroy?.();
    } catch (error) {
      console.debug("[Data sources] Layer cleanup failed.", error);
    }
  }
}
