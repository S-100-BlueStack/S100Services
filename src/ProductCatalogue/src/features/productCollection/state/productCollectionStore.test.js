import assert from "node:assert/strict";
import test from "node:test";

import {
  addProductCollectionProduct,
  clearProductCollection,
  getProductCollectionSnapshot,
  hasProductCollectionProduct,
  removeProductCollectionProduct,
  subscribeProductCollection,
} from "./productCollectionStore.js";

test("addProductCollectionProduct adds unique products case-insensitively", () => {
  clearProductCollection();

  const firstResult = addProductCollectionProduct({ datasetName: "101DK001NORSO" });
  const duplicateResult = addProductCollectionProduct({ datasetName: "101dk001norso" });

  assert.equal(firstResult.added, true);
  assert.equal(duplicateResult.added, false);
  assert.equal(duplicateResult.reason, "already-added");
  assert.deepEqual(getProductCollectionSnapshot().datasetNames, ["101DK001NORSO"]);
});

test("removeProductCollectionProduct removes by dataset name", () => {
  clearProductCollection();

  addProductCollectionProduct("101DK001NORSO");
  addProductCollectionProduct("101DK0021733C");

  removeProductCollectionProduct("101dk001norso");

  assert.deepEqual(getProductCollectionSnapshot().datasetNames, ["101DK0021733C"]);
});

test("hasProductCollectionProduct matches case-insensitively", () => {
  clearProductCollection();

  addProductCollectionProduct("101DK001NORSO");

  assert.equal(hasProductCollectionProduct("101dk001norso"), true);
  assert.equal(hasProductCollectionProduct("101DK0021733C"), false);
});

test("subscribeProductCollection receives updated snapshots", () => {
  clearProductCollection();

  const snapshots = [];
  const unsubscribe = subscribeProductCollection((snapshot) => {
    snapshots.push(snapshot);
  });

  addProductCollectionProduct("101DK001NORSO");
  removeProductCollectionProduct("101DK001NORSO");
  unsubscribe();
  addProductCollectionProduct("101DK0021733C");

  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[0].datasetNames, ["101DK001NORSO"]);
  assert.deepEqual(snapshots[1].datasetNames, []);
});
