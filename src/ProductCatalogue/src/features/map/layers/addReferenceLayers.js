import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import MapImageLayer from "@arcgis/core/layers/MapImageLayer.js";

import { referenceLayerConfigs } from "../config/referenceLayerConfigs.js";

function normalizeServiceUrl(url) {
  return String(url ?? "").replace(/\/+$/, "");
}

function createMapImageReferenceLayer(config) {
  if (!Number.isInteger(config.layerId)) {
    throw new Error(`Reference layer '${config.id}' must have a numeric layerId.`);
  }

  return new MapImageLayer({
    id: config.id,
    title: config.title,
    url: normalizeServiceUrl(config.url),
    visible: config.visible ?? true,
    opacity: config.opacity ?? 1,

    sublayers: [
      {
        id: config.layerId,
        visible: true,
      },
    ],
  });
}
function createFeatureReferenceLayer(config) {
  if (!Number.isInteger(config.layerId)) {
    throw new Error(`Reference layer '${config.id}' must have a numeric layerId.`);
  }

  return new FeatureLayer({
    id: config.id,
    title: config.title,

    // Point directly at the concrete layer endpoint so the layer id is explicit.
    url: `${normalizeServiceUrl(config.url)}/${config.layerId}`,

    visible: config.visible ?? true,
    opacity: config.opacity ?? 1,

    // This is a background/reference layer. Correction popups stay on your GraphicsLayers.
    popupEnabled: false,
  });
}

function createReferenceLayer(config) {
  if (!config?.id) {
    throw new Error("Reference layer configuration must have an id.");
  }

  if (!config.url) {
    throw new Error(`Reference layer '${config.id}' must have a url.`);
  }

  switch (config.serviceType) {
    case "map-image":
      return createMapImageReferenceLayer(config);

    case "feature":
      return createFeatureReferenceLayer(config);

    default:
      throw new Error(`Unsupported reference layer serviceType: ${config.serviceType}`);
  }
}

export function addReferenceLayers(map, { onLoadError } = {}) {
  const layers = referenceLayerConfigs.map(createReferenceLayer);

  // Insert reference layers at operational layer index 0.
  // The basemap is separate from map.layers, so index 0 is directly above the basemap.
  // Existing correction GraphicsLayers are added later and will render above these layers.
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    map.add(layer, 0);
    void layer
      .load()
      .then(() => {
        console.table(
          layer.allSublayers.map((sublayer) => ({
            id: sublayer.id,
            title: sublayer.title,
            visible: sublayer.visible,
            parent: sublayer.parent?.id ?? null,
          }))
        );
      })
      .catch((error) => {
        onLoadError?.(layer, error);
      });
    void layer.load().catch((error) => {
      onLoadError?.(layer, error);
    });
  }

  return layers;
}
