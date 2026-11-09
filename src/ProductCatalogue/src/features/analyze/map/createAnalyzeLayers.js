import { createLayer } from "../../map/core/layerFactory.js";
import { WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION } from "../../map/symbology/correctionSymbolResolver.js";
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
    // The Product detail provides the authoritative Package status. Keep member
    // states as metadata, but never derive map colors from candidate status.
    entry.feature.attributes.workUnitStatus = {
      packageStatus: product.packageStatus,
      members: product.members.map((member) => ({
        key: member.memberKey,
        datasetName: member.datasetName,
        status: member.status,
        ...(member.errorMessage != null ? { errorMessage: member.errorMessage } : {}),
      })),
    };
    // The shared popup table reads source-member details from the graphic.
    // Keep these display fields tied to validated Analyze member identities;
    // they do not grant any package mutation capability.
    const members = product.workUnit.members ?? [];
    entry.feature.attributes.workUnitMetadata = {
      members: Object.fromEntries(
        product.members
          .filter((member) =>
            members.some(
              (declared) =>
                declared.key === member.memberKey &&
                declared.datasetName?.trim().toUpperCase() ===
                  member.datasetName?.trim().toUpperCase()
            )
          )
          .map((member) => [
            member.memberKey,
            {
              datasetName: member.datasetName,
              edition: member.edition,
              update: member.update,
              issueDate: member.issueDate,
            },
          ])
      ),
    };
    addGeometryDefinition(definitions, [entry], {
      id: `analyze-package:${product.workUnit.identityKey}`,
      title: product.datasetName,
      appAnalyzeWorkUnitKey: product.workUnit.identityKey,
      symbolization: WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION,
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
    for (const [index, definition] of definitions.entries()) {
      // Aggregate each layer's progress into the single initial loading session.
      // Reporting raw per-layer fractions would make the bar jump backwards.
      const reportLayerProgress = onProgress
        ? ({ progress, stage, layerTitle }) =>
            onProgress({
              progress:
                (index + Math.min(1, Math.max(0, Number(progress) || 0))) / definitions.length,
              stage,
              layerTitle,
            })
        : undefined;
      const layer = await createLayer(
        map,
        { ...definition, popupReadOnly: true },
        { onProgress: reportLayerProgress }
      );
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
