import { createLayer } from "../../map/core/layerFactory.js";
import {
  createCompatibilityAnalyzeEntry,
  createProductContextLookup,
  createSourceAnalyzeEntry,
  registerAnalyzeGraphicProductContexts,
} from "./analyzeGraphicProductContext.js";

export async function createAnalyzeLayers(map, products, { onProgress } = {}) {
  const compatibilityEntries = products
    .map((product, index) => createCompatibilityAnalyzeEntry(product, index))
    .filter(Boolean);
  const sourceEntries = products
    .map((product, index) => createSourceAnalyzeEntry(product, index))
    .filter(Boolean);
  const definitions = [];

  if (compatibilityEntries.length > 0) {
    const productContextByIdentityKey = createProductContextLookup(compatibilityEntries);
    const registrableEntries = getRegistrableEntries(
      compatibilityEntries,
      productContextByIdentityKey
    );
    if (registrableEntries.length > 0) {
      definitions.push({
        id: "analyze-products",
        title: "Analyze products",
        type: "graphics",
        dataFormat: "esri-json",
        data: {
          features: registrableEntries.map((entry) => entry.feature),
        },
        productContextByIdentityKey,
      });
    }
  }

  if (sourceEntries.length > 0) {
    const productContextByIdentityKey = createProductContextLookup(sourceEntries);
    const registrableEntries = getRegistrableEntries(sourceEntries, productContextByIdentityKey);
    if (registrableEntries.length > 0) {
      definitions.push({
        id: "analyze-source-products",
        title: "Analyze source products",
        type: "graphics",
        dataFormat: "geojson",
        data: {
          type: "FeatureCollection",
          features: registrableEntries.map((entry) => entry.feature),
        },
        productContextByIdentityKey,
      });
    }
  }

  const layers = [];
  for (const definition of definitions) {
    const layer = await createLayer(map, definition, { onProgress });
    if (layer) {
      registerAnalyzeGraphicProductContexts(layer, definition.productContextByIdentityKey);
      layers.push(layer);
    }
  }

  return layers;
}

function getRegistrableEntries(entries, productContextByIdentityKey) {
  return entries.filter((entry) => {
    const identityKey = entry?.productContext?.identityKey;
    return productContextByIdentityKey.get(identityKey) === entry.productContext;
  });
}
