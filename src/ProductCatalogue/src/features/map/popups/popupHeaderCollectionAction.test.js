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

function createCompatibilityFeature({ datasetName = "DK4TEST" } = {}) {
  return {
    attributes: { datasetName },
    layer: { customId: "aoi" },
  };
}

function createRegistryFeature(sourceId, { datasetName } = {}) {
  const source = registry.byId.get(sourceId);
  const layerDefinition = source?.layerDefinitions?.[0];
  assert.ok(source, `Expected registry source ${sourceId}`);
  assert.ok(layerDefinition, `Expected layer definition for ${sourceId}`);

  const resolvedDatasetName = datasetName ?? `${sourceId}-product`;
  return {
    attributes: {
      datasetName: resolvedDatasetName,
      productKey: resolvedDatasetName,
      productType: source.productType,
      sourceId: source.id,
    },
    layer: {
      customId: layerDefinition.id,
      appLayerId: layerDefinition.id,
      appLayerKind: layerDefinition.layerKind,
      appLayerCapabilities: layerDefinition.capabilities,
      appSourceDefinition: source,
      appSourceId: source.id,
      dataSourceId: source.id,
      sourceId: source.id,
      appProductType: source.productType,
    },
  };
}

function createCustomSourceFeature({
  sourceId = "future-source",
  datasetName = "FUTURE-1",
  supportsPopupActions = false,
  productCollection = false,
} = {}) {
  const productType = "future-product";
  const sourceDefinition = {
    id: sourceId,
    label: "Future source",
    productType,
    capabilities: { productCollection },
    exportConfiguration: null,
  };

  return {
    attributes: {
      datasetName,
      productKey: datasetName,
      productType,
      sourceId,
    },
    layer: {
      customId: "future-products",
      appLayerCapabilities: { supportsPopupActions },
      appSourceDefinition: sourceDefinition,
      appSourceId: sourceId,
      dataSourceId: sourceId,
      sourceId,
      appProductType: productType,
    },
  };
}

test("compatibility AOI features support Product Collection", () => {
  assert.deepEqual(resolvePopupHeaderCollectionAvailability(createCompatibilityFeature()), {
    supported: true,
    datasetName: "DK4TEST",
  });
});

test("Paper Charts does not support Product Collection while popup actions stay enabled", () => {
  const feature = createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, {
    datasetName: "PAPER-1",
  });

  assert.equal(feature.layer.appLayerCapabilities.supportsPopupActions, true);
  assert.equal(feature.layer.appSourceDefinition.capabilities.productCollection, false);
  assert.deepEqual(resolvePopupHeaderCollectionAvailability(feature), {
    supported: false,
    datasetName: "PAPER-1",
  });
});

test("S-102 does not support Product Collection", () => {
  const feature = createRegistryFeature(DATA_SOURCE_IDS.S102, { datasetName: "S102-1" });

  assert.equal(resolvePopupHeaderCollectionAvailability(feature).supported, false);
});

test("Product Collection availability follows its Product capability instead of supportsPopupActions", () => {
  const collectionEnabled = createCustomSourceFeature({
    supportsPopupActions: false,
    productCollection: true,
  });
  const collectionDisabled = createCustomSourceFeature({
    sourceId: "future-disabled-source",
    datasetName: "FUTURE-2",
    supportsPopupActions: true,
    productCollection: false,
  });

  assert.equal(resolvePopupHeaderCollectionAvailability(collectionEnabled).supported, true);
  assert.equal(resolvePopupHeaderCollectionAvailability(collectionDisabled).supported, false);
});

test("Paper Charts can render popup action-bar content without Product Collection support", () => {
  const source = registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS);
  const layerDefinition = source.layerDefinitions[0];

  assert.equal(layerDefinition.capabilities.supportsPopupActions, true);
  assert.equal(source.capabilities.productCollection, false);
});

test("switching AOI to Paper Charts removes a stale collection action", () => {
  assertSelectionSwitchRemovesCollectionAction(
    createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, { datasetName: "PAPER-1" })
  );
});

test("switching AOI to S-102 removes a stale collection action", () => {
  assertSelectionSwitchRemovesCollectionAction(
    createRegistryFeature(DATA_SOURCE_IDS.S102, { datasetName: "S102-1" })
  );
});

test("mock Products cannot mutate Product Collection", () => {
  for (const [sourceId, datasetName] of [
    [DATA_SOURCE_IDS.PAPER_CHARTS, "PAPER-1"],
    [DATA_SOURCE_IDS.S102, "S102-1"],
  ]) {
    let addCalls = 0;
    let removeCalls = 0;
    const result = mutatePopupHeaderCollection({
      feature: createRegistryFeature(sourceId, { datasetName }),
      expectedDatasetName: datasetName,
      hasProduct: () => false,
      addProduct: () => {
        addCalls += 1;
      },
      removeProduct: () => {
        removeCalls += 1;
      },
    });

    assert.deepEqual(result, {
      handled: false,
      reason: "unsupported",
      datasetName,
    });
    assert.equal(addCalls, 0);
    assert.equal(removeCalls, 0);
  }
});

test("compatibility AOI can add and remove the current Product Collection item", () => {
  const feature = createCompatibilityFeature();
  const added = [];
  const removed = [];

  const addResult = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "DK4TEST",
    hasProduct: () => false,
    addProduct: (product) => {
      added.push(product);
      return { added: true };
    },
    removeProduct: (datasetName) => removed.push(datasetName),
  });

  assert.equal(addResult.handled, true);
  assert.deepEqual(addResult.addResult, { added: true });
  assert.deepEqual(added, [{ datasetName: "DK4TEST" }]);
  assert.deepEqual(removed, []);

  const removeResult = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "DK4TEST",
    hasProduct: () => true,
    addProduct: (product) => added.push(product),
    removeProduct: (datasetName) => removed.push(datasetName),
  });

  assert.deepEqual(removeResult, {
    handled: true,
    removed: true,
    datasetName: "DK4TEST",
  });
  assert.deepEqual(removed, ["DK4TEST"]);
});

test("a stale button cannot mutate a different selected feature", () => {
  let addCalls = 0;
  const result = mutatePopupHeaderCollection({
    feature: createCompatibilityFeature({ datasetName: "DK4NEW" }),
    expectedDatasetName: "DK4OLD",
    hasProduct: () => false,
    addProduct: () => {
      addCalls += 1;
    },
  });

  assert.equal(result.handled, false);
  assert.equal(addCalls, 0);
});

test("missing or unknown Product context fails Product Collection closed", () => {
  const missingContext = {
    attributes: { datasetName: "UNKNOWN-1" },
    layer: { customId: "unknown-layer" },
  };
  const inconsistentSource = createRegistryFeature(DATA_SOURCE_IDS.PAPER_CHARTS, {
    datasetName: "PAPER-2",
  });
  inconsistentSource.layer.appSourceId = DATA_SOURCE_IDS.S102;

  assert.equal(resolvePopupHeaderCollectionAvailability(missingContext).supported, false);
  assert.equal(resolvePopupHeaderCollectionAvailability(inconsistentSource).supported, false);
});

test("Review and Analyze routes keep the popup header collection action disabled", () => {
  assert.equal(
    resolvePopupHeaderCollectionAvailability(createCompatibilityFeature(), {
      isReviewOrAnalyzeRoute: true,
    }).supported,
    false
  );
});

function assertSelectionSwitchRemovesCollectionAction(nextFeature) {
  let actionVisible = false;
  reconcilePopupHeaderCollectionAction({
    feature: createCompatibilityFeature(),
    onSupported: () => {
      actionVisible = true;
    },
    onUnsupported: () => {
      actionVisible = false;
    },
  });
  assert.equal(actionVisible, true);

  reconcilePopupHeaderCollectionAction({
    feature: nextFeature,
    onSupported: () => {
      actionVisible = true;
    },
    onUnsupported: () => {
      actionVisible = false;
    },
  });
  assert.equal(actionVisible, false);
}
