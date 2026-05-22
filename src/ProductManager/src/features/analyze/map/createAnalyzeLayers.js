import { createLayer } from "../../map/core/layerFactory.js";

export async function createAnalyzeLayers(map, products, { onProgress } = {}) {
  const features = products.map(createAnalyzeFeature).filter(Boolean);

  if (features.length === 0) {
    return [];
  }

  const createdLayers = await createLayer(
    map,
    {
      id: "analyze-products",
      type: "graphics",
      dataFormat: "esri-json",
      data: {
        features,
      },
      scaleRanges: {
        overview: {
          minScale: 0,
          maxScale: 1_000_000,
        },
        detail: {
          minScale: 1_000_000,
          maxScale: 0,
        },
      },
    },
    {
      onProgress,
    }
  );

  return normalizeCreatedLayers(createdLayers);
}

function normalizeCreatedLayers(layerOrLayers) {
  if (Array.isArray(layerOrLayers)) {
    return layerOrLayers.flat().filter(Boolean);
  }

  if (layerOrLayers) {
    return [layerOrLayers];
  }

  return [];
}

function createAnalyzeFeature(product, index) {
  if (!product.aoiGeometry) {
    return null;
  }

  return {
    geometry: product.aoiGeometry,
    attributes: {
      datasetName: product.datasetName,
      edition: product.edition,
      update: product.update,
      status: product.status,
      errorMessage: product.errorMessage,
      featureKey: `analyze:${product.datasetName}:${index}`,
      analyzeLoadError: product.loadError,
      analyzeIsMock: product.isMock,
    },
  };
}
