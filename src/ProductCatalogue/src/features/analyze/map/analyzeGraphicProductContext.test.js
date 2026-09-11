import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPATIBILITY_PRODUCT_SOURCE_ID,
  PRODUCT_OPERATION_CAPABILITY,
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
  productContextSupportsCapability,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import {
  createCompatibilityAnalyzeEntry,
  createProductContextLookup,
  createSourceAnalyzeEntry,
  registerAnalyzeGraphicProductContexts,
} from "./analyzeGraphicProductContext.js";

const SOURCE_CAPABILITIES = Object.freeze({
  productCollection: true,
  analyze: true,
  review: true,
  backendProductRefresh: false,
});

function createSourceContext({ sourceId, sourceLabel, productKey, datasetName, productType }) {
  return createWorkspaceProductContext({
    sourceId,
    sourceLabel,
    productKey,
    datasetName,
    productType,
    capabilities: SOURCE_CAPABILITIES,
  });
}

function createFakeGraphic(entry) {
  return {
    attributes: {
      ...(entry.feature.attributes ?? entry.feature.properties ?? {}),
    },
  };
}

test("mixed Analyze Graphics preserve independently resolved ProductContext per Graphic", () => {
  const compatibilityContext = createCompatibilityWorkspaceProductContext("101DK0041149E");
  const paperContext = createSourceContext({
    sourceId: "paper-charts",
    sourceLabel: "Paper Charts",
    productKey: "P001",
    datasetName: "PAPER-MOCK-P001",
    productType: "paper-chart",
  });
  const s102Context = createSourceContext({
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "101DK0041149E (S-102)",
    datasetName: "102DK0041149E",
    productType: "s102-product",
  });

  const entries = [
    createCompatibilityAnalyzeEntry(
      {
        datasetName: compatibilityContext.datasetName,
        productContext: compatibilityContext,
        aoiGeometry: {
          rings: [
            [
              [10, 56],
              [11, 56],
              [10, 56],
            ],
          ],
        },
      },
      0
    ),
    createSourceAnalyzeEntry(
      {
        datasetName: paperContext.datasetName,
        productContext: paperContext,
        sourceFeature: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [10, 56] },
          properties: { productName: "1149E" },
        },
      },
      1
    ),
    createSourceAnalyzeEntry(
      {
        datasetName: s102Context.datasetName,
        productContext: s102Context,
        sourceFeature: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [11, 56] },
          properties: { productName: "1149E" },
        },
      },
      2
    ),
  ];
  const graphics = entries.map(createFakeGraphic);
  const layer = { graphics };

  registerAnalyzeGraphicProductContexts(layer, createProductContextLookup(entries));

  assert.equal(resolveProductContext({ graphic: graphics[0] }).sourceId, "compatibility-aoi");
  assert.equal(resolveProductContext({ graphic: graphics[1] }).sourceId, "paper-charts");
  const s102 = resolveProductContext({ graphic: graphics[2] });
  assert.equal(s102.sourceId, "s102");
  assert.equal(s102.datasetName, "102DK0041149E");
  assert.equal(s102.productKey, "101DK0041149E (S-102)");
  assert.equal(graphics[2].attributes.datasetName, "102DK0041149E");
  assert.equal(graphics[2].attributes.productKey, "101DK0041149E (S-102)");

  const popupGraphicClone = { attributes: { ...graphics[2].attributes } };
  assert.equal(resolveProductContext({ graphic: popupGraphicClone }).sourceId, "s102");
});

test("registered Analyze Graphic fails closed when authoritative identity metadata is inconsistent", () => {
  const context = createSourceContext({
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "S102-PRODUCT",
    datasetName: "102DK0041149E",
    productType: "s102-product",
  });
  const entry = createSourceAnalyzeEntry(
    {
      productContext: context,
      sourceFeature: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10, 56] },
        properties: {},
      },
    },
    0
  );
  const graphic = createFakeGraphic(entry);
  registerAnalyzeGraphicProductContexts(
    { graphics: [graphic] },
    createProductContextLookup([entry])
  );

  graphic.attributes.productType = "compatibility-product";
  assert.equal(resolveProductContext({ graphic }), null);
});

function createPostTransformGraphic(entry, layerId) {
  const sourceAttributes = entry.feature.attributes ?? entry.feature.properties ?? {};
  return {
    layer: {
      customId: layerId,
      appLayerId: layerId,
      appLayerKind: "analyze-products",
    },
    attributes: {
      ...sourceAttributes,
      // Map transformers namespace featureKey with layerId. Product identity must remain stable.
      featureKey: `${layerId}:${entry.featureKey}`,
    },
  };
}

test("compatibility Analyze registration survives layer-prefixed Esri JSON featureKey", () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041149E");
  const entry = createCompatibilityAnalyzeEntry(
    {
      datasetName: context.datasetName,
      productContext: context,
      aoiGeometry: {
        rings: [
          [
            [10, 56],
            [11, 56],
            [10, 56],
          ],
        ],
      },
      status: "Idle",
    },
    0
  );
  const lookup = createProductContextLookup([entry]);
  const graphic = createPostTransformGraphic(entry, "analyze-products");

  assert.equal(lookup.has(entry.featureKey), false);
  assert.equal(lookup.get(context.identityKey), context);
  assert.equal(graphic.attributes.featureKey, `analyze-products:${entry.featureKey}`);
  assert.equal(graphic.attributes.productIdentityKey, context.identityKey);

  registerAnalyzeGraphicProductContexts({ graphics: [graphic] }, lookup);

  const resolved = resolveProductContext({ graphic });
  assert.equal(resolved?.sourceId, COMPATIBILITY_PRODUCT_SOURCE_ID);
  assert.equal(resolved?.identityKey, context.identityKey);
  assert.equal(
    productContextSupportsCapability(
      resolved,
      PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH
    ),
    true
  );
});

test("S-102 Analyze registration survives layer-prefixed GeoJSON featureKey", () => {
  const context = createSourceContext({
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "101DK0041149E (S-102)",
    datasetName: "102DK0041149E",
    productType: "s102-product",
  });
  const entry = createSourceAnalyzeEntry(
    {
      datasetName: context.datasetName,
      productContext: context,
      sourceFeature: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [11, 56] },
        properties: { productName: "1149E" },
      },
    },
    0
  );
  const lookup = createProductContextLookup([entry]);
  const graphic = createPostTransformGraphic(entry, "analyze-source-products");

  assert.equal(graphic.attributes.featureKey, `analyze-source-products:${entry.featureKey}`);
  assert.equal(graphic.attributes.productIdentityKey, context.identityKey);

  registerAnalyzeGraphicProductContexts({ graphics: [graphic] }, lookup);

  const resolved = resolveProductContext({ graphic });
  assert.equal(resolved?.sourceId, "s102");
  assert.equal(resolved?.productKey, "101DK0041149E (S-102)");
  assert.equal(resolved?.datasetName, "102DK0041149E");
  assert.equal(
    productContextSupportsCapability(
      resolved,
      PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH
    ),
    false
  );
});

test("Paper Charts Analyze registration survives layer-prefixed GeoJSON featureKey", () => {
  const context = createSourceContext({
    sourceId: "paper-charts",
    sourceLabel: "Paper Charts",
    productKey: "P001",
    datasetName: "PAPER-MOCK-P001",
    productType: "paper-chart",
  });
  const entry = createSourceAnalyzeEntry(
    {
      datasetName: context.datasetName,
      productContext: context,
      sourceFeature: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10, 56] },
        properties: { productName: "1149E" },
      },
    },
    0
  );
  const lookup = createProductContextLookup([entry]);
  const graphic = createPostTransformGraphic(entry, "analyze-source-products");

  registerAnalyzeGraphicProductContexts({ graphics: [graphic] }, lookup);

  const resolved = resolveProductContext({ graphic });
  assert.equal(resolved?.sourceId, "paper-charts");
  assert.equal(resolved?.productKey, "P001");
  assert.equal(resolved?.datasetName, "PAPER-MOCK-P001");
  assert.equal(
    productContextSupportsCapability(
      resolved,
      PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH
    ),
    false
  );
});

test("mixed post-transform Analyze Graphics register independently through productIdentityKey", () => {
  const compatibilityContext = createCompatibilityWorkspaceProductContext("101DK0041150E");
  const paperContext = createSourceContext({
    sourceId: "paper-charts",
    sourceLabel: "Paper Charts",
    productKey: "P002",
    datasetName: "PAPER-MOCK-P002",
    productType: "paper-chart",
  });
  const s102Context = createSourceContext({
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "S102-MIXED-1",
    datasetName: "102DK0041150E",
    productType: "s102-product",
  });

  const compatibilityEntry = createCompatibilityAnalyzeEntry(
    {
      datasetName: compatibilityContext.datasetName,
      productContext: compatibilityContext,
      aoiGeometry: {
        rings: [
          [
            [10, 56],
            [11, 56],
            [10, 56],
          ],
        ],
      },
    },
    0
  );
  const sourceEntries = [
    [paperContext, { type: "Point", coordinates: [10, 56] }],
    [s102Context, { type: "Point", coordinates: [11, 56] }],
  ].map(([productContext, geometry], index) =>
    createSourceAnalyzeEntry(
      {
        datasetName: productContext.datasetName,
        productContext,
        sourceFeature: { type: "Feature", geometry, properties: { productName: "1149E" } },
      },
      index + 1
    )
  );

  const compatibilityGraphic = createPostTransformGraphic(compatibilityEntry, "analyze-products");
  const sourceGraphics = sourceEntries.map((entry) =>
    createPostTransformGraphic(entry, "analyze-source-products")
  );

  registerAnalyzeGraphicProductContexts(
    { graphics: [compatibilityGraphic] },
    createProductContextLookup([compatibilityEntry])
  );
  registerAnalyzeGraphicProductContexts(
    { graphics: sourceGraphics },
    createProductContextLookup(sourceEntries)
  );

  assert.equal(
    resolveProductContext({ graphic: compatibilityGraphic })?.sourceId,
    "compatibility-aoi"
  );
  assert.equal(resolveProductContext({ graphic: sourceGraphics[0] })?.sourceId, "paper-charts");
  assert.equal(resolveProductContext({ graphic: sourceGraphics[1] })?.sourceId, "s102");
  assert.notEqual(
    sourceGraphics[0].attributes.productIdentityKey,
    sourceGraphics[1].attributes.productIdentityKey
  );
});

test("duplicate Analyze productIdentityKey is rejected before Graphic registration", () => {
  const context = createSourceContext({
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "S102-DUPLICATE-REGISTRATION",
    datasetName: "102DK0041199E",
    productType: "s102-product",
  });
  const product = {
    datasetName: context.datasetName,
    productContext: context,
    sourceFeature: {
      type: "Feature",
      geometry: { type: "Point", coordinates: [10, 56] },
      properties: {},
    },
  };
  const entries = [createSourceAnalyzeEntry(product, 0), createSourceAnalyzeEntry(product, 1)];
  const lookup = createProductContextLookup(entries);
  const graphic = createPostTransformGraphic(entries[0], "analyze-source-products");

  assert.equal(lookup.has(context.identityKey), false);
  assert.equal(lookup.size, 0);

  registerAnalyzeGraphicProductContexts({ graphics: [graphic] }, lookup);
  assert.equal(resolveProductContext({ graphic }), null);
});
