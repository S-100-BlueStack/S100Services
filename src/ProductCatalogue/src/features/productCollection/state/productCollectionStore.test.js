import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { COMPATIBILITY_PRODUCT_SOURCE_ID } from "../../products/domain/productContext.js";
import {
  addProductCollectionProduct,
  clearProductCollection,
  getProductCollectionDatasetNames,
  getProductCollectionSnapshot,
  hasProductCollectionProduct,
  reconcileProductCollectionSourceProducts,
  removeProductCollectionProduct,
  removeProductCollectionProductsBySource,
  subscribeProductCollection,
} from "./productCollectionStore.js";

beforeEach(() => clearProductCollection());

function product(sourceId, datasetName, productType = `${sourceId}-product`) {
  return {
    sourceId,
    sourceLabel: sourceId === "paper-charts" ? "Paper Charts" : sourceId,
    productKey: datasetName,
    datasetName,
    productType,
  };
}

test("compatibility Products retain source-aware metadata and legacy case-insensitive dedupe", () => {
  const first = addProductCollectionProduct("DK4TEST");
  const duplicate = addProductCollectionProduct("dk4test");
  assert.equal(first.added, true);
  assert.equal(duplicate.added, false);
  assert.equal(first.item.sourceId, COMPATIBILITY_PRODUCT_SOURCE_ID);
  assert.equal(first.item.productKey, "DK4TEST");
  assert.equal(first.item.datasetName, "DK4TEST");
});

test("Paper Charts and S-102 use source-aware deterministic identities without collisions", () => {
  const paper = addProductCollectionProduct(product("paper-charts", "SHARED", "paper-chart"));
  const s102 = addProductCollectionProduct(product("s102", "SHARED", "s102-product"));
  assert.equal(paper.added, true);
  assert.equal(s102.added, true);
  assert.notEqual(paper.item.id, s102.item.id);
  assert.equal(getProductCollectionSnapshot().count, 2);
});

test("remove accepts stable identity, ProductContext shape, and legacy dataset projection", () => {
  const paper = addProductCollectionProduct(product("paper-charts", "PAPER-1", "paper-chart"));
  addProductCollectionProduct("AOI-1");
  removeProductCollectionProduct(paper.item.id);
  assert.equal(
    hasProductCollectionProduct(product("paper-charts", "PAPER-1", "paper-chart")),
    false
  );
  removeProductCollectionProduct("aoi-1");
  assert.equal(getProductCollectionSnapshot().count, 0);
});

test("datasetNames projection remains stable for mixed collections", () => {
  addProductCollectionProduct("AOI-1");
  addProductCollectionProduct(product("paper-charts", "PAPER-1", "paper-chart"));
  addProductCollectionProduct(product("s102", "S102-1", "s102-product"));
  assert.deepEqual(getProductCollectionDatasetNames(), ["AOI-1", "PAPER-1", "S102-1"]);
  assert.deepEqual(getProductCollectionSnapshot().datasetNames, ["AOI-1", "PAPER-1", "S102-1"]);
});

test("S-102 Collection item projects its authoritative datasetName unchanged", () => {
  addProductCollectionProduct({
    ...product("s102", "102DK0041149E", "s102-product"),
    productKey: "s102-product-1149e",
  });

  const snapshot = getProductCollectionSnapshot();
  assert.equal(snapshot.items[0].datasetName, "102DK0041149E");
  assert.deepEqual(snapshot.datasetNames, ["102DK0041149E"]);
  assert.deepEqual(getProductCollectionDatasetNames(), ["102DK0041149E"]);
});

test("source removal removes only the requested source", () => {
  addProductCollectionProduct("AOI-1");
  addProductCollectionProduct(product("paper-charts", "PAPER-1", "paper-chart"));
  addProductCollectionProduct(product("s102", "S102-1", "s102-product"));
  removeProductCollectionProductsBySource("paper-charts");
  assert.deepEqual(getProductCollectionDatasetNames(), ["AOI-1", "S102-1"]);
});

test("successful source reconciliation prunes stale items without adding current Products", () => {
  addProductCollectionProduct(product("paper-charts", "PAPER-OLD", "paper-chart"));
  addProductCollectionProduct(product("paper-charts", "PAPER-KEEP", "paper-chart"));
  reconcileProductCollectionSourceProducts("paper-charts", [
    product("paper-charts", "PAPER-KEEP", "paper-chart"),
    product("paper-charts", "PAPER-NEW", "paper-chart"),
  ]);
  assert.deepEqual(getProductCollectionDatasetNames(), ["PAPER-KEEP"]);
});

test("subscriptions publish source-aware snapshots", () => {
  const snapshots = [];
  const unsubscribe = subscribeProductCollection((snapshot) => snapshots.push(snapshot));
  addProductCollectionProduct(product("s102", "S102-1", "s102-product"));
  unsubscribe();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].items[0].sourceId, "s102");
});
