import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_SOURCE_IDS,
  createDataSourceRegistry,
} from "../../dataSources/config/dataSourceRegistry.js";
import {
  mutatePopupHeaderCollection,
  reconcilePopupHeaderCollectionAction,
  resolvePopupHeaderCollectionAvailability,
} from "./popupHeaderCollectionAction.js";

const registry = createDataSourceRegistry({ isDevelopment: true });

function createCompatibilityFeature(datasetName = "DK4TEST") {
  return { attributes: { datasetName }, layer: { customId: "aoi" } };
}

function createRegistryFeature(sourceId, datasetName) {
  const source = registry.byId.get(sourceId);
  const definition = source.layerDefinitions[0];
  const name = datasetName ?? `${sourceId}-product`;
  return {
    attributes: {
      datasetName: name,
      productKey: name,
      productType: source.productType,
      sourceId: source.id,
    },
    layer: {
      customId: definition.id,
      appLayerId: definition.id,
      appLayerKind: definition.layerKind,
      appLayerCapabilities: definition.capabilities,
      appSourceDefinition: source,
      appSourceId: source.id,
      dataSourceId: source.id,
      sourceId: source.id,
      appProductType: source.productType,
    },
  };
}

test("compatibility, Paper Charts and S-102 support Product Collection with source-aware identity", () => {
  const compatibility = resolvePopupHeaderCollectionAvailability(createCompatibilityFeature());
  const paper = resolvePopupHeaderCollectionAvailability(
    createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, "PAPER-1")
  );
  const s102 = resolvePopupHeaderCollectionAvailability(
    createRegistryFeature(DATA_SOURCE_IDS.S102, "S102-1")
  );
  assert.equal(compatibility.supported, true);
  assert.equal(paper.supported, true);
  assert.equal(s102.supported, true);
  assert.equal(paper.productContext.sourceId, "paper-charts");
  assert.equal(s102.productContext.sourceId, "s102");
  assert.notEqual(paper.identityKey, s102.identityKey);
});

test("Product Collection capability remains independent from backend Product actions", () => {
  for (const sourceId of [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]) {
    const source = registry.byId.get(sourceId);
    assert.equal(source.capabilities.productCollection, true);
    assert.equal(source.layerDefinitions[0].capabilities.supportsPopupActions, true);
    assert.equal(source.layerDefinitions[0].capabilities.supportsProductActions, false);
    assert.equal(source.capabilities.freeze, false);
    assert.equal(source.capabilities.sendToIcEnc, false);
    assert.equal(source.capabilities.cancelExport, false);
  }
});

test("switching AOI to a mock Product replaces Collection identity instead of retaining stale selection", () => {
  const identities = [];
  for (const feature of [
    createCompatibilityFeature("AOI-1"),
    createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, "PAPER-1"),
  ]) {
    reconcilePopupHeaderCollectionAction({
      feature,
      onSupported: (availability) => identities.push(availability.identityKey),
    });
  }
  assert.equal(identities.length, 2);
  assert.notEqual(identities[0], identities[1]);
});

test("mock Products add and remove through ProductContext rather than dataset-only mutation", () => {
  const feature = createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, "PAPER-1");
  const availability = resolvePopupHeaderCollectionAvailability(feature);
  const added = [];
  const removed = [];
  const addResult = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "PAPER-1",
    expectedIdentityKey: availability.identityKey,
    hasProduct: () => false,
    addProduct: (context) => {
      added.push(context);
      return { added: true };
    },
  });
  assert.equal(addResult.handled, true);
  assert.equal(added[0].sourceId, "paper-charts");
  const removeResult = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "PAPER-1",
    expectedIdentityKey: availability.identityKey,
    hasProduct: () => true,
    removeProduct: (context) => removed.push(context),
  });
  assert.equal(removeResult.removed, true);
  assert.equal(removed[0].productKey, "PAPER-1");
});

test("stale dataset or source identity cannot mutate Collection", () => {
  let calls = 0;
  const feature = createRegistryFeature(DATA_SOURCE_IDS.S102, "S102-NEW");
  const result = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "S102-OLD",
    expectedIdentityKey: JSON.stringify(["s102", "S102-OLD"]),
    hasProduct: () => false,
    addProduct: () => {
      calls += 1;
    },
  });
  assert.equal(result.handled, false);
  assert.equal(calls, 0);
});

test("unknown or inconsistent Product context fails closed", () => {
  const unknown = { attributes: { datasetName: "UNKNOWN" }, layer: { customId: "unknown" } };
  const inconsistent = createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, "PAPER-2");
  inconsistent.layer.appSourceId = DATA_SOURCE_IDS.S102;
  assert.equal(resolvePopupHeaderCollectionAvailability(unknown).supported, false);
  assert.equal(resolvePopupHeaderCollectionAvailability(inconsistent).supported, false);
});

test("Review and Analyze routes keep popup-header Collection mutation disabled", () => {
  assert.equal(
    resolvePopupHeaderCollectionAvailability(createCompatibilityFeature(), {
      isReviewOrAnalyzeRoute: true,
    }).supported,
    false
  );
});
