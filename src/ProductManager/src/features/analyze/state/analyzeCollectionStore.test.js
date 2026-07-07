import assert from "node:assert/strict";
import test from "node:test";

import {
  addAnalyzeCollectionProduct,
  clearAnalyzeCollection,
  getAnalyzeCollectionSnapshot,
  hasAnalyzeCollectionProduct,
  removeAnalyzeCollectionProduct,
  subscribeAnalyzeCollection,
} from "./analyzeCollectionStore.js";

test("addAnalyzeCollectionProduct adds unique products case-insensitively", () => {
  clearAnalyzeCollection();

  const firstResult = addAnalyzeCollectionProduct({ datasetName: "101DK001NORSO" });
  const duplicateResult = addAnalyzeCollectionProduct({ datasetName: "101dk001norso" });

  assert.equal(firstResult.added, true);
  assert.equal(duplicateResult.added, false);
  assert.equal(duplicateResult.reason, "already-added");
  assert.deepEqual(getAnalyzeCollectionSnapshot().datasetNames, ["101DK001NORSO"]);
});

test("removeAnalyzeCollectionProduct removes by dataset name", () => {
  clearAnalyzeCollection();

  addAnalyzeCollectionProduct("101DK001NORSO");
  addAnalyzeCollectionProduct("101DK0021733C");

  removeAnalyzeCollectionProduct("101dk001norso");

  assert.deepEqual(getAnalyzeCollectionSnapshot().datasetNames, ["101DK0021733C"]);
});

test("hasAnalyzeCollectionProduct matches case-insensitively", () => {
  clearAnalyzeCollection();

  addAnalyzeCollectionProduct("101DK001NORSO");

  assert.equal(hasAnalyzeCollectionProduct("101dk001norso"), true);
  assert.equal(hasAnalyzeCollectionProduct("101DK0021733C"), false);
});

test("subscribeAnalyzeCollection receives updated snapshots", () => {
  clearAnalyzeCollection();

  const snapshots = [];
  const unsubscribe = subscribeAnalyzeCollection((snapshot) => {
    snapshots.push(snapshot);
  });

  addAnalyzeCollectionProduct("101DK001NORSO");
  removeAnalyzeCollectionProduct("101DK001NORSO");
  unsubscribe();
  addAnalyzeCollectionProduct("101DK0021733C");

  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[0].datasetNames, ["101DK001NORSO"]);
  assert.deepEqual(snapshots[1].datasetNames, []);
});
