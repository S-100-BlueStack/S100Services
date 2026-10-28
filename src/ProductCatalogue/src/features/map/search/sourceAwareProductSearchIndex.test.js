import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";

import { createSourceAwareProductSearchIndex } from "./sourceAwareProductSearchIndex.js";

describe("sourceAwareProductSearchIndex", () => {
  it("searches active compatibility and runtime providers", () => {
    const index = createSourceAwareProductSearchIndex();
    index.replaceProvider({
      providerId: PRODUCT_CORRECTIONS_LAYER_ID,
      generation: 1,
      layers: [createLayer(PRODUCT_CORRECTIONS_LAYER_ID, [{ datasetName: "AOI-001" }])],
    });
    index.replaceProvider({
      providerId: "paper-charts",
      sourceId: "paper-charts",
      sourceLabel: "Paper Charts",
      generation: 1,
      layers: [createLayer("paper-charts-products", [{ datasetName: "PAPER-001" }])],
    });
    index.replaceProvider({
      providerId: "s102",
      sourceId: "s102",
      sourceLabel: "S-102",
      generation: 1,
      layers: [createLayer("s102-products", [{ datasetName: "S102-001" }])],
    });

    assert.deepEqual(
      index.getEntries().map((entry) => entry.label),
      ["AOI-001", "PAPER-001", "S102-001"]
    );
    assert.equal(index.search("Paper Charts")[0].label, "PAPER-001");
  });

  it("deduplicates one logical Product represented in multiple provider layers", () => {
    const index = createSourceAwareProductSearchIndex();
    const overviewGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 20,
    });
    const detailGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 10,
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [
        createLayerWithGraphics("paper-overview", [overviewGraphic]),
        createLayerWithGraphics("paper-detail", [detailGraphic]),
      ],
    });

    const results = index.search("PAPER-001");
    assert.equal(results.length, 1);
    assert.equal(results[0].productKey, "paper-001");
    assert.equal(results[0].layerId, "paper-detail");
    assert.equal(results[0].graphic, detailGraphic);
  });

  it("keeps the Product result ID stable when provider layer order changes", () => {
    const index = createSourceAwareProductSearchIndex();
    const detailGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const overviewGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const detailLayer = createLayerWithGraphics("paper-detail", [detailGraphic]);
    const overviewLayer = createLayerWithGraphics("paper-overview", [overviewGraphic]);

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [overviewLayer, detailLayer],
    });
    const first = index.getEntries()[0];

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [detailLayer, overviewLayer],
    });
    const second = index.getEntries()[0];

    assert.equal(first.id, second.id);
    assert.equal(second.layerId, "paper-detail");
    assert.equal(second.graphic, detailGraphic);
  });

  it("keeps equal labels with different Product keys separate in one provider", () => {
    const index = createSourceAwareProductSearchIndex();

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [
        createLayer("paper-products", [
          { datasetName: "Shared label", productIdentityKey: "paper-a" },
          { datasetName: "Shared label", productIdentityKey: "paper-b" },
        ]),
      ],
    });

    const results = index.search("Shared label");
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
    assert.deepEqual(
      new Set(results.map((entry) => entry.productKey)),
      new Set(["paper-a", "paper-b"])
    );
  });

  it("keeps the same Product key source-aware across providers", () => {
    const index = createSourceAwareProductSearchIndex();

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [
        createLayer("paper-products", [
          { datasetName: "Shared Product", productIdentityKey: "shared-key" },
        ]),
      ],
    });
    index.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [
        createLayer("s102-products", [
          { datasetName: "Shared Product", productIdentityKey: "shared-key" },
        ]),
      ],
    });

    const results = index.search("Shared Product");
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
    assert.deepEqual(
      new Set(results.map((entry) => entry.providerId)),
      new Set(["paper-charts", "s102"])
    );
  });

  it("refreshes the representative Graphic without changing the logical result", () => {
    const index = createSourceAwareProductSearchIndex();
    const oldGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const newGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [oldGraphic])],
    });
    const initialResult = index.getEntries()[0];

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [createLayerWithGraphics("paper-products", [newGraphic])],
    });

    assert.equal(index.getEntries().length, 1);
    assert.equal(index.getEntries()[0].id, initialResult.id);
    assert.equal(index.resolve(initialResult.id).graphic, newGraphic);
  });

  it("resolves the current committed representation used by selection after refresh", () => {
    const index = createSourceAwareProductSearchIndex();
    const oldGraphic = createGraphic({
      datasetName: "S102-001",
      productIdentityKey: "s102-001",
    });
    const currentGraphic = createGraphic({
      datasetName: "S102-001",
      productIdentityKey: "s102-001",
    });

    index.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [createLayerWithGraphics("s102-secondary", [oldGraphic])],
    });
    const selectedResultId = index.getEntries()[0].id;

    index.replaceProvider({
      providerId: "s102",
      generation: 2,
      layers: [
        createLayerWithGraphics("s102-secondary", [currentGraphic]),
        createLayer("s102-summary", [{ datasetName: "S102-001", productIdentityKey: "s102-001" }]),
      ],
    });

    const resolved = index.resolve(selectedResultId);
    assert.equal(resolved.id, selectedResultId);
    assert.equal(resolved.graphic, currentGraphic);
    assert.equal(resolved.layerId, "s102-secondary");
  });

  it("removes disabled source results and reactivation publishes fresh results", () => {
    const index = createSourceAwareProductSearchIndex();
    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-charts-products", [{ datasetName: "PAPER-OLD" }])],
    });

    index.removeProvider("paper-charts", { generation: 2 });
    assert.equal(index.search("PAPER").length, 0);

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [createLayer("paper-charts-products", [{ datasetName: "PAPER-FRESH" }])],
    });
    assert.deepEqual(
      index.search("PAPER").map((entry) => entry.label),
      ["PAPER-FRESH"]
    );
  });

  it("atomically replaces provider entries without duplicate suggestions", () => {
    const index = createSourceAwareProductSearchIndex();
    const layer = createLayer("s102-products", [{ datasetName: "S102-001" }]);

    index.replaceProvider({ providerId: "s102", generation: 1, layers: [layer] });
    index.replaceProvider({ providerId: "s102", generation: 2, layers: [layer] });

    assert.equal(index.search("S102-001").length, 1);
  });

  it("uses source-aware result ids so identical labels resolve to the correct graphic", () => {
    const index = createSourceAwareProductSearchIndex();
    const paperGraphic = createGraphic({ datasetName: "SHARED-NAME" });
    const s102Graphic = createGraphic({ datasetName: "SHARED-NAME" });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-charts-products", [paperGraphic])],
    });
    index.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [createLayerWithGraphics("s102-products", [s102Graphic])],
    });

    const results = index.search("SHARED-NAME");
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
    assert.equal(index.resolve(results[0].id).graphic, results[0].graphic);
    assert.equal(index.resolve(results[1].id).graphic, results[1].graphic);
  });

  it("rejects stale refresh publication after a newer removal or replacement", () => {
    const index = createSourceAwareProductSearchIndex();
    index.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [createLayer("paper-charts-products", [{ datasetName: "CURRENT" }])],
    });
    index.removeProvider("paper-charts", { generation: 4 });

    const stale = index.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [createLayer("paper-charts-products", [{ datasetName: "STALE" }])],
    });

    assert.deepEqual(stale, { published: false, stale: true, count: 0 });
    assert.equal(index.getEntries().length, 0);
  });

  it("prefers a Graphic with an authoritative object ID in the same layer", () => {
    const index = createSourceAwareProductSearchIndex();
    const withObjectId = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 20,
    });
    const withoutObjectId = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [withoutObjectId, withObjectId])],
    });

    const result = index.getEntries()[0];
    assert.equal(result.graphic, withObjectId);
    assert.equal(result.layerId, "paper-products");
  });

  it("selects the same object-ID representative when Graphic order is reversed", () => {
    const withObjectId = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 20,
    });
    const withoutObjectId = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const firstIndex = createSourceAwareProductSearchIndex();
    const secondIndex = createSourceAwareProductSearchIndex();

    firstIndex.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [withObjectId, withoutObjectId])],
    });
    secondIndex.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [withoutObjectId, withObjectId])],
    });

    assert.equal(firstIndex.getEntries()[0].graphic, withObjectId);
    assert.equal(secondIndex.getEntries()[0].graphic, withObjectId);
    assert.equal(firstIndex.getEntries()[0].id, secondIndex.getEntries()[0].id);
  });

  it("selects deterministically between two authoritative object IDs", () => {
    const index = createSourceAwareProductSearchIndex();
    const objectId20 = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 20,
    });
    const objectId10 = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 10,
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [objectId20, objectId10])],
    });

    assert.equal(index.getEntries()[0].graphic, objectId10);
  });

  it("uses committed collection order when no Graphic has a stable object ID", () => {
    const index = createSourceAwareProductSearchIndex();
    const firstGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const secondGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [firstGraphic, secondGraphic])],
    });

    assert.equal(index.getEntries()[0].graphic, firstGraphic);
  });

  it("updates the representative after refresh without changing the Product result ID", () => {
    const index = createSourceAwareProductSearchIndex();
    const fallbackGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
    });
    const authoritativeGraphic = createGraphic({
      datasetName: "PAPER-001",
      productIdentityKey: "paper-001",
      OBJECTID: 12,
    });

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayerWithGraphics("paper-products", [fallbackGraphic])],
    });
    const resultId = index.getEntries()[0].id;

    index.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [createLayerWithGraphics("paper-products", [fallbackGraphic, authoritativeGraphic])],
    });

    assert.equal(index.getEntries().length, 1);
    assert.equal(index.getEntries()[0].id, resultId);
    assert.equal(index.resolve(resultId).graphic, authoritativeGraphic);
  });
});

function createLayer(id, attributesList) {
  return createLayerWithGraphics(id, attributesList.map(createGraphic));
}

function createLayerWithGraphics(id, graphics) {
  const layer = {
    appLayerId: id,
    id,
    graphics: {
      toArray: () => graphics,
    },
  };
  graphics.forEach((graphic) => {
    graphic.layer = layer;
  });
  return layer;
}

function createGraphic(attributes) {
  return { attributes: { ...attributes } };
}
