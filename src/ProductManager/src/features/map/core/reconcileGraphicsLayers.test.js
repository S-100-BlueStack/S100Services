import assert from "node:assert/strict";
import test from "node:test";

import { reconcileGraphicsLayers } from "./reconcileGraphicsLayers.js";

test("reconciliation preserves matching graphic identity and updates its state", () => {
  const currentGraphic = createGraphic("feature-1", {
    status: "Idle",
  });
  const candidateGraphic = createGraphic("feature-1", {
    status: "Exported",
  });
  candidateGraphic.geometry = createJsonValue({ x: 2, y: 3 });
  candidateGraphic.symbol = createJsonValue({ type: "new-symbol" });

  const currentLayer = createLayer("products", [currentGraphic]);
  const candidateLayer = createLayer("products", [candidateGraphic]);

  const result = reconcileGraphicsLayers({
    currentLayers: [currentLayer],
    candidateLayers: [candidateLayer],
  });

  assert.equal(result.success, true);
  assert.equal(currentLayer.graphics.toArray()[0], currentGraphic);
  assert.equal(currentLayer._index.get("feature-1"), currentGraphic);
  assert.equal(currentGraphic.attributes.status, "Exported");
  assert.deepEqual(currentGraphic.geometry.toJSON(), { x: 2, y: 3 });
  assert.deepEqual(currentGraphic.symbol.toJSON(), { type: "new-symbol" });
  assert.equal(result.updatedGraphicsCount, 1);
  assert.equal(result.changedFeatureKeys.has("feature-1"), true);
});

test("reconciliation adds and removes graphics while rebuilding the layer index", () => {
  const retainedGraphic = createGraphic("feature-1", { status: "Idle" });
  const removedGraphic = createGraphic("feature-2", { status: "Idle" });
  const candidateRetainedGraphic = createGraphic("feature-1", { status: "Idle" });
  const addedGraphic = createGraphic("feature-3", { status: "Frozen" });

  const currentLayer = createLayer("products", [retainedGraphic, removedGraphic]);
  const candidateLayer = createLayer("products", [candidateRetainedGraphic, addedGraphic]);

  const result = reconcileGraphicsLayers({
    currentLayers: [currentLayer],
    candidateLayers: [candidateLayer],
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    currentLayer.graphics.toArray().map((graphic) => graphic.attributes.featureKey),
    ["feature-1", "feature-3"]
  );
  assert.equal(currentLayer._index.get("feature-1"), retainedGraphic);
  assert.equal(currentLayer._index.get("feature-3"), addedGraphic);
  assert.equal(result.addedGraphicsCount, 1);
  assert.equal(result.removedGraphicsCount, 1);
});

test("structural layer changes request the existing full rebuild fallback", () => {
  const currentLayer = createLayer("products", [createGraphic("feature-1")]);
  const candidateLayer = createLayer("other-products", [createGraphic("feature-1")]);
  const originalGraphics = currentLayer.graphics.toArray();

  const result = reconcileGraphicsLayers({
    currentLayers: [currentLayer],
    candidateLayers: [candidateLayer],
  });

  assert.deepEqual(result, {
    success: false,
    strategy: "rebuild-required",
    reason: "layer-set-changed",
  });
  assert.deepEqual(currentLayer.graphics.toArray(), originalGraphics);
});

test("invalid candidate feature identity does not partially mutate current layers", () => {
  const currentGraphic = createGraphic("feature-1", { status: "Idle" });
  const duplicateOne = createGraphic("feature-1", { status: "Frozen" });
  const duplicateTwo = createGraphic("feature-1", { status: "Exported" });
  const currentLayer = createLayer("products", [currentGraphic]);
  const candidateLayer = createLayer("products", [duplicateOne, duplicateTwo]);

  const result = reconcileGraphicsLayers({
    currentLayers: [currentLayer],
    candidateLayers: [candidateLayer],
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "candidate-feature-identity-invalid");
  assert.equal(currentLayer.graphics.toArray()[0], currentGraphic);
  assert.equal(currentGraphic.attributes.status, "Idle");
});

function createLayer(id, graphics) {
  const collection = [...graphics];

  return {
    customId: id,
    appLayerId: id,
    appLayerKind: "product-corrections",
    appLayerCapabilities: {
      supportsProductActions: true,
    },
    layerType: "graphics",
    title: "Products",
    graphics: {
      toArray: () => [...collection],
    },
    _index: new Map(collection.map((graphic) => [graphic.attributes.featureKey, graphic])),
    removeAll() {
      collection.length = 0;
    },
    removeMany(items) {
      for (const item of items) {
        const index = collection.indexOf(item);
        if (index >= 0) {
          collection.splice(index, 1);
        }
      }
    },
    addMany(items) {
      collection.push(...items);
    },
  };
}

function createGraphic(featureKey, attributes = {}) {
  return {
    attributes: {
      featureKey,
      ...attributes,
    },
    geometry: createJsonValue({ x: 1, y: 1 }),
    symbol: createJsonValue({ type: "symbol" }),
    visible: true,
  };
}

function createJsonValue(value) {
  return {
    ...value,
    toJSON() {
      return value;
    },
  };
}
