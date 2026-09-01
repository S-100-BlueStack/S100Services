import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_SOURCE_IDS,
  createDataSourceRegistry,
} from "../../dataSources/config/dataSourceRegistry.js";
import { LAYER_KINDS, PRODUCT_CORRECTIONS_LAYER_ID } from "../../map/config/layerDefinitions.js";
import {
  fetchPopupProductRefresh,
  initializePopupBackendSynchronization,
} from "../../map/popups/popupBackendSync.js";
import {
  COMPATIBILITY_PRODUCT_SOURCE_ID,
  PRODUCT_OPERATION_CAPABILITY,
  createCompatibilityWorkspaceProductContext,
  createProductContextIdentityAttributes,
  createWorkspaceProductContext,
  productContextSupportsCapability,
  registerGraphicProductContext,
  resolveProductContext,
} from "./productContext.js";

function createCompatibilityMainGraphic(datasetName = "101DK0041149E") {
  const context = createCompatibilityWorkspaceProductContext(datasetName);
  return {
    layer: {
      customId: PRODUCT_CORRECTIONS_LAYER_ID,
      appLayerId: PRODUCT_CORRECTIONS_LAYER_ID,
      appLayerKind: LAYER_KINDS.PRODUCT_CORRECTIONS,
    },
    attributes: {
      ...createProductContextIdentityAttributes(context),
      layerId: PRODUCT_CORRECTIONS_LAYER_ID,
      layerKind: LAYER_KINDS.PRODUCT_CORRECTIONS,
      status: "Idle",
    },
  };
}

function createRegistryMainGraphic(sourceId, { productKey, datasetName }) {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
  const layerDefinition = source.layerDefinitions[0];

  return {
    layer: {
      customId: layerDefinition.id,
      appLayerId: layerDefinition.id,
      appLayerKind: layerDefinition.layerKind,
      appSourceDefinition: source,
      appSourceId: source.id,
      appSourceLabel: source.label,
      appSourceCapabilities: source.capabilities,
      appProductType: source.productType,
      appExportConfiguration: source.exportConfiguration,
    },
    attributes: {
      sourceId: source.id,
      sourceLabel: source.label,
      productKey,
      productIdentityKey: JSON.stringify([source.id, productKey]),
      datasetName,
      productType: source.productType,
      layerId: layerDefinition.id,
      layerKind: layerDefinition.layerKind,
      status: "Idle",
    },
  };
}

function createSourceWorkspaceContext(sourceId, { productKey, datasetName, productType } = {}) {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
  return createWorkspaceProductContext({
    sourceId: source.id,
    sourceLabel: source.label,
    productKey,
    datasetName,
    productType: productType ?? source.productType,
    capabilities: source.capabilities,
    exportConfiguration: source.exportConfiguration,
    contentConfiguration: source.contentConfiguration,
  });
}

function registerGenericAnalyzeContext(productContext) {
  const graphic = {
    layer: {
      customId: "analyze-source-products",
      appLayerId: "analyze-source-products",
      appLayerKind: "analyze-products",
    },
    attributes: {
      ...createProductContextIdentityAttributes(productContext),
      featureKey: `analyze:${productContext.identityKey}:0`,
      status: "Idle",
    },
  };

  assert.equal(registerGraphicProductContext(graphic, productContext), true);
  return graphic;
}

function createBackendHarness(productContext) {
  const calls = {
    watch: [],
    register: [],
    fetch: [],
  };

  const sync = initializePopupBackendSynchronization({
    productContext,
    datasetName: productContext?.datasetName,
    refresh: async () => true,
    watchActiveProductJobs: (datasetName) => {
      calls.watch.push(datasetName);
      return () => {};
    },
    registerPopupRefreshHandler: ({ datasetName }) => {
      calls.register.push(datasetName);
      return () => {};
    },
  });

  return {
    calls,
    sync,
    fetch: async () => {
      return fetchPopupProductRefresh({
        productContext,
        datasetName: productContext?.datasetName,
        fetchProduct: async (datasetName) => {
          calls.fetch.push(datasetName);
          return { success: true, data: { datasetName } };
        },
      });
    },
  };
}

function seedStaleIdentityContext(productContext) {
  const staleContext = createWorkspaceProductContext({
    sourceId: productContext.sourceId,
    sourceLabel: productContext.sourceLabel,
    productKey: productContext.productKey,
    datasetName: productContext.datasetName,
    productType: `${productContext.productType}-stale`,
    capabilities: productContext.capabilities,
    exportConfiguration: productContext.exportConfiguration,
    contentConfiguration: productContext.contentConfiguration,
  });
  registerGenericAnalyzeContext(staleContext);
  return staleContext;
}

test("Main-map compatibility layer wins over stale Analyze identity cache and enables backend synchronization", async () => {
  const graphic = createCompatibilityMainGraphic();
  const expected = createCompatibilityWorkspaceProductContext(graphic.attributes.datasetName);
  seedStaleIdentityContext(expected);

  const context = resolveProductContext({ graphic });
  assert.ok(context);
  assert.equal(context.sourceId, COMPATIBILITY_PRODUCT_SOURCE_ID);
  assert.equal(context.datasetName, "101DK0041149E");
  assert.equal(
    productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH),
    true
  );

  const backend = createBackendHarness(context);
  assert.equal(backend.sync.enabled, true);
  assert.deepEqual(backend.calls.watch, ["101DK0041149E"]);
  assert.deepEqual(backend.calls.register, ["101DK0041149E"]);
  assert.equal((await backend.fetch()).dispatched, true);
  assert.deepEqual(backend.calls.fetch, ["101DK0041149E"]);
});

test("Main-map Paper Charts layer wins over stale Analyze identity cache without compatibility backend synchronization", async () => {
  const graphic = createRegistryMainGraphic(DATA_SOURCE_IDS.PAPER_CHARTS, {
    productKey: "P001",
    datasetName: "PAPER-MOCK-P001",
  });
  const expected = createSourceWorkspaceContext(DATA_SOURCE_IDS.PAPER_CHARTS, {
    productKey: "P001",
    datasetName: "PAPER-MOCK-P001",
  });
  seedStaleIdentityContext(expected);

  const context = resolveProductContext({ graphic });
  assert.ok(context);
  assert.equal(context.sourceId, DATA_SOURCE_IDS.PAPER_CHARTS);
  assert.equal(context.productKey, "P001");
  assert.equal(context.datasetName, "PAPER-MOCK-P001");

  const backend = createBackendHarness(context);
  assert.equal(backend.sync.enabled, false);
  assert.deepEqual(backend.calls.watch, []);
  assert.deepEqual(backend.calls.register, []);
  assert.equal((await backend.fetch()).dispatched, false);
  assert.deepEqual(backend.calls.fetch, []);
});

test("Main-map S-102 layer wins over stale Analyze identity cache without compatibility backend synchronization", async () => {
  const graphic = createRegistryMainGraphic(DATA_SOURCE_IDS.S102, {
    productKey: "101DK0041149E (S-102)",
    datasetName: "102DK0041149E",
  });
  const expected = createSourceWorkspaceContext(DATA_SOURCE_IDS.S102, {
    productKey: "101DK0041149E (S-102)",
    datasetName: "102DK0041149E",
  });
  seedStaleIdentityContext(expected);

  const context = resolveProductContext({ graphic });
  assert.ok(context);
  assert.equal(context.sourceId, DATA_SOURCE_IDS.S102);
  assert.equal(context.productKey, "101DK0041149E (S-102)");
  assert.equal(context.datasetName, "102DK0041149E");

  const backend = createBackendHarness(context);
  assert.equal(backend.sync.enabled, false);
  assert.deepEqual(backend.calls.watch, []);
  assert.deepEqual(backend.calls.register, []);
  assert.equal((await backend.fetch()).dispatched, false);
  assert.deepEqual(backend.calls.fetch, []);
});

test("exact registered Analyze Graphic keeps strict fail-closed metadata validation", () => {
  const context = createSourceWorkspaceContext(DATA_SOURCE_IDS.S102, {
    productKey: "S102-EXACT-1",
    datasetName: "102DK0041150E",
  });
  const graphic = registerGenericAnalyzeContext(context);

  assert.equal(resolveProductContext({ graphic })?.identityKey, context.identityKey);

  graphic.attributes.productType = "paper-chart";
  assert.equal(resolveProductContext({ graphic }), null);
});

test("equivalent Analyze popup Graphic resolves only when complete registered identity metadata matches", () => {
  const context = createSourceWorkspaceContext(DATA_SOURCE_IDS.S102, {
    productKey: "S102-CLONE-1",
    datasetName: "102DK0041151E",
  });
  const registeredGraphic = registerGenericAnalyzeContext(context);
  const clone = {
    layer: { ...registeredGraphic.layer },
    attributes: { ...registeredGraphic.attributes },
  };

  const resolved = resolveProductContext({ graphic: clone });
  assert.ok(resolved);
  assert.equal(resolved.identityKey, context.identityKey);
  assert.equal(resolved.sourceId, DATA_SOURCE_IDS.S102);

  delete clone.attributes.productType;
  assert.equal(resolveProductContext({ graphic: clone }), null);
});

test("registered Analyze compatibility Graphic retains compatibility backend synchronization", async () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041152E");
  const graphic = registerGenericAnalyzeContext(context);
  const resolved = resolveProductContext({ graphic });

  assert.equal(resolved?.sourceId, COMPATIBILITY_PRODUCT_SOURCE_ID);
  const backend = createBackendHarness(resolved);
  assert.equal(backend.sync.enabled, true);
  assert.deepEqual(backend.calls.watch, ["101DK0041152E"]);
  assert.deepEqual(backend.calls.register, ["101DK0041152E"]);
  assert.equal((await backend.fetch()).dispatched, true);
});

test("registered Analyze Paper Charts and S-102 Graphics retain source context with backend synchronization disabled", async () => {
  for (const [sourceId, productKey, datasetName] of [
    [DATA_SOURCE_IDS.PAPER_CHARTS, "P002", "PAPER-MOCK-P002"],
    [DATA_SOURCE_IDS.S102, "S102-ANALYZE-1", "102DK0041153E"],
  ]) {
    const context = createSourceWorkspaceContext(sourceId, { productKey, datasetName });
    const graphic = registerGenericAnalyzeContext(context);
    const resolved = resolveProductContext({ graphic });

    assert.equal(resolved?.sourceId, sourceId);
    const backend = createBackendHarness(resolved);
    assert.equal(backend.sync.enabled, false);
    assert.deepEqual(backend.calls.watch, []);
    assert.deepEqual(backend.calls.register, []);
    assert.equal((await backend.fetch()).dispatched, false);
  }
});

test("unknown generic Analyze identity fails closed with zero compatibility backend synchronization", async () => {
  const graphic = {
    layer: {
      customId: "analyze-source-products",
      appLayerId: "analyze-source-products",
      appLayerKind: "analyze-products",
    },
    attributes: {
      sourceId: DATA_SOURCE_IDS.S102,
      productKey: "UNKNOWN",
      productIdentityKey: '["s102","UNKNOWN"]',
      datasetName: "102UNKNOWN",
      status: "Idle",
    },
  };

  const context = resolveProductContext({ graphic });
  assert.equal(context, null);
  const backend = createBackendHarness(context);
  assert.equal(backend.sync.enabled, false);
  assert.deepEqual(backend.calls.watch, []);
  assert.deepEqual(backend.calls.register, []);
  assert.equal((await backend.fetch()).dispatched, false);
});
