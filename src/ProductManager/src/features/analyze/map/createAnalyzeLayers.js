import { createLayer } from "../../map/core/layerFactory.js";

export async function createAnalyzeLayers(map, products, { onProgress } = {}) {
  const features = products.map(createAnalyzeFeature).filter(Boolean);

  if (features.length === 0) {
    return [];
  }

  const layer = await createLayer(
    map,
    {
      id: "analyze-products",
      title: "Analyze products",
      type: "graphics",
      dataFormat: "esri-json",
      data: {
        features,
      },
    },
    {
      onProgress,
    }
  );

  return layer ? [layer] : [];
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
