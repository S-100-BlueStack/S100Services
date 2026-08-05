import assert from "node:assert/strict";
import test from "node:test";

import {
  mutatePopupHeaderCollection,
  reconcilePopupHeaderCollectionAction,
  resolvePopupHeaderCollectionAvailability,
} from "./popupHeaderCollectionAction.js";

function createFeature({ datasetName, layerId, capabilities, sourceId } = {}) {
  return {
    attributes: {
      datasetName,
      sourceId,
    },
    layer: {
      customId: layerId,
      appLayerCapabilities: capabilities,
    },
  };
}

test("compatibility AOI features support the popup header collection action", () => {
  const feature = createFeature({
    datasetName: "DK4TEST",
    layerId: "aoi",
  });

  assert.deepEqual(resolvePopupHeaderCollectionAvailability(feature), {
    supported: true,
    datasetName: "DK4TEST",
  });
});

test("Paper Charts and S-102 features do not support the popup header collection action", () => {
  for (const [sourceId, layerId] of [
    ["paper-charts", "paper-charts-products"],
    ["s102", "s102-products"],
  ]) {
    const feature = createFeature({
      datasetName: `${sourceId}-product`,
      sourceId,
      layerId,
    });

    assert.equal(resolvePopupHeaderCollectionAvailability(feature).supported, false);
  }
});

test("collection availability follows layer capabilities instead of source identifiers", () => {
  const supportedFutureSource = createFeature({
    datasetName: "FUTURE-1",
    sourceId: "future-source",
    layerId: "future-products",
    capabilities: { supportsPopupActions: true },
  });
  const unsupportedCompatibilityNamedSource = createFeature({
    datasetName: "AOI-NAMED-1",
    sourceId: "compatibility-aoi",
    layerId: "future-products",
    capabilities: { supportsPopupActions: false },
  });

  assert.equal(resolvePopupHeaderCollectionAvailability(supportedFutureSource).supported, true);
  assert.equal(
    resolvePopupHeaderCollectionAvailability(unsupportedCompatibilityNamedSource).supported,
    false
  );
});

test("reconciliation removes a stale collection action when selection becomes unsupported", () => {
  let actionVisible = false;
  const compatibilityFeature = createFeature({
    datasetName: "DK4TEST",
    layerId: "aoi",
  });
  const mockFeature = createFeature({
    datasetName: "S102-1",
    sourceId: "s102",
    layerId: "s102-products",
  });

  reconcilePopupHeaderCollectionAction({
    feature: compatibilityFeature,
    onSupported: () => {
      actionVisible = true;
    },
    onUnsupported: () => {
      actionVisible = false;
    },
  });
  assert.equal(actionVisible, true);

  reconcilePopupHeaderCollectionAction({
    feature: mockFeature,
    onSupported: () => {
      actionVisible = true;
    },
    onUnsupported: () => {
      actionVisible = false;
    },
  });
  assert.equal(actionVisible, false);
});

test("unsupported mock features cannot mutate Product Collection", () => {
  let addCalls = 0;
  let removeCalls = 0;
  const feature = createFeature({
    datasetName: "PAPER-1",
    sourceId: "paper-charts",
    layerId: "paper-charts-products",
  });

  const result = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "PAPER-1",
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
    datasetName: "PAPER-1",
  });
  assert.equal(addCalls, 0);
  assert.equal(removeCalls, 0);
});

test("supported features can add and remove the current Product Collection item", () => {
  const feature = createFeature({
    datasetName: "DK4TEST",
    layerId: "aoi",
  });
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
  const feature = createFeature({
    datasetName: "DK4NEW",
    layerId: "aoi",
  });

  const result = mutatePopupHeaderCollection({
    feature,
    expectedDatasetName: "DK4OLD",
    hasProduct: () => false,
    addProduct: () => {
      addCalls += 1;
    },
  });

  assert.equal(result.handled, false);
  assert.equal(addCalls, 0);
});
