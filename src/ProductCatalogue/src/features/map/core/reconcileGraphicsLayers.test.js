import assert from "node:assert/strict";
import test from "node:test";

import {
  WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  resolveCorrectionSymbol,
} from "../symbology/correctionSymbolResolver.js";
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

test("package reconciliation preserves Graphic identity across scalar and mixed transitions", () => {
  const currentGraphic = createPackageGraphic("feature-1", {
    status: 8,
  });
  const currentLayer = createLayer("products", [currentGraphic], {
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  const transitions = [
    {
      attributes: {
        status: 8,
        workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
      },
      expectedType: "cim",
    },
    {
      attributes: {
        status: 8,
        workUnitStatus: { members: [{ status: 10 }, { status: 12 }] },
      },
      expectedType: "cim",
    },
    {
      attributes: {
        status: 8,
        workUnitStatus: { members: [{ status: 11 }, { status: "11" }] },
      },
      expectedType: "simple-fill",
    },
  ];

  let previousSymbol = currentGraphic.symbol;
  for (const transition of transitions) {
    const candidateGraphic = createPackageGraphic("feature-1", transition.attributes);
    const candidateLayer = createLayer("products", [candidateGraphic], {
      symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
    });

    const result = reconcileGraphicsLayers({
      currentLayers: [currentLayer],
      candidateLayers: [candidateLayer],
    });

    assert.equal(result.success, true);
    assert.equal(currentLayer.graphics.toArray()[0], currentGraphic);
    assert.equal(currentGraphic.symbol.type, transition.expectedType);
    assert.notEqual(currentGraphic.symbol, previousSymbol);
    previousSymbol = currentGraphic.symbol;
  }
});

test("reordered equivalent mixed state avoids symbol churn while preserving Graphic identity", () => {
  const currentGraphic = createPackageGraphic("feature-1", {
    status: 8,
    workUnitStatus: {
      members: [
        { key: "alpha", status: 8 },
        { key: "beta", status: 11 },
      ],
    },
  });
  const originalSymbol = currentGraphic.symbol;
  const currentLayer = createLayer("products", [currentGraphic], {
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
  const candidateGraphic = createPackageGraphic("feature-1", {
    status: 8,
    workUnitStatus: {
      members: [
        { key: "beta", status: "11" },
        { key: "alpha", status: "8" },
      ],
    },
  });
  const candidateLayer = createLayer("products", [candidateGraphic], {
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  const result = reconcileGraphicsLayers({
    currentLayers: [currentLayer],
    candidateLayers: [candidateLayer],
  });

  assert.equal(result.success, true);
  assert.equal(currentLayer.graphics.toArray()[0], currentGraphic);
  assert.equal(currentGraphic.symbol, originalSymbol);
  assert.deepEqual(currentGraphic.symbol, candidateGraphic.symbol);
});

function createLayer(id, graphics, { symbolization = null } = {}) {
  const collection = [...graphics];

  return {
    customId: id,
    appLayerId: id,
    appLayerKind: "product-corrections",
    appLayerCapabilities: {
      supportsProductActions: true,
    },
    appSymbolization: symbolization,
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

function createPackageGraphic(featureKey, attributes) {
  const geometry = { type: "polygon", rings: [] };
  return {
    attributes: {
      featureKey,
      ...attributes,
    },
    geometry,
    symbol: resolveCorrectionSymbol({
      attributes,
      geometry,
      symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
    }),
    visible: true,
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
