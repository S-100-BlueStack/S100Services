import { createLayer } from "../../map/core/layerFactory.js";
import { WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION } from "../../map/symbology/correctionSymbolResolver.js";
import {
  createCompatibilityAnalyzeEntry,
  createProductContextLookup,
  createSourceAnalyzeEntry,
  registerAnalyzeGraphicProductContexts,
} from "./analyzeGraphicProductContext.js";

export async function createAnalyzeLayers(map, products, { onProgress } = {}) {
  const ordinaryProducts = products.filter((product) => product.workUnit?.kind !== "package");
  const packageProducts = products.filter((product) => product.workUnit?.kind === "package");
  const compatibilityEntries = ordinaryProducts
    .map((product, index) => createCompatibilityAnalyzeEntry(product, index))
    .filter(Boolean);
  const sourceEntries = ordinaryProducts
    .map((product, index) => createSourceAnalyzeEntry(product, index))
    .filter(Boolean);
  const definitions = [];

  addGeometryDefinition(definitions, compatibilityEntries, {
    id: "analyze-products",
    title: "Analyze products",
  });
  for (const product of packageProducts) {
    const entry = createCompatibilityAnalyzeEntry(product, 0);
    if (!entry) continue;
    // Analyze has already accepted the complete member snapshot. Render those
    // supplied Product statuses through F2 without inventing workflow/member state.
    entry.feature.attributes.workUnitStatus = {
      members: product.members.map((member) => ({
        key: member.memberKey,
        datasetName: member.datasetName,
        status: member.status,
      })),
    };
    addGeometryDefinition(definitions, [entry], {
      id: `analyze-package:${product.workUnit.identityKey}`,
      title: product.datasetName,
      appAnalyzeWorkUnitKey: product.workUnit.identityKey,
      symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
    });
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
  try {
    for (const definition of definitions) {
      const layer = await createLayer(map, definition, { onProgress });
      if (layer) {
        layer.appAnalyzeWorkUnitKey = definition.appAnalyzeWorkUnitKey ?? null;
        registerAnalyzeGraphicProductContexts(layer, definition.productContextByIdentityKey);
        layers.push(layer);
      }
    }
  } catch (error) {
    for (const layer of layers) map.remove(layer);
    throw error;
  }
  return layers;
}

function getRegistrableEntries(entries, productContextByIdentityKey) {
  return entries.filter((entry) => {
    const identityKey = entry?.productContext?.identityKey;
    return productContextByIdentityKey.get(identityKey) === entry.productContext;
  });
}

function addGeometryDefinition(definitions, entries, identity) {
  if (!entries.length) return;
  const productContextByIdentityKey = createProductContextLookup(entries);
  const registrableEntries = getRegistrableEntries(entries, productContextByIdentityKey);
  if (!registrableEntries.length) return;
  definitions.push({
    ...identity,
    type: "graphics",
    dataFormat: "esri-json",
    data: { features: registrableEntries.map((entry) => entry.feature) },
    productContextByIdentityKey,
  });
}
