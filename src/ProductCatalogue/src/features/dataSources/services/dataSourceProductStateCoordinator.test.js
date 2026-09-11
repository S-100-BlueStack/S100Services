import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  addProductCollectionProduct,
  clearProductCollection,
  getProductCollectionDatasetNames,
} from "../../productCollection/state/productCollectionStore.js";
import { createDataSourceProductStateCoordinator } from "./dataSourceProductStateCoordinator.js";

beforeEach(() => clearProductCollection());

function createLifecycle() {
  const listeners = new Map();
  return {
    subscribe(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
    emit(name, detail) {
      for (const listener of listeners.get(name) ?? []) listener(detail);
    },
  };
}

function add(sourceId, datasetName, productType) {
  addProductCollectionProduct({
    sourceId,
    sourceLabel: sourceId,
    productKey: datasetName,
    datasetName,
    productType,
  });
}

function layer(sourceId, datasetNames, productType) {
  return {
    graphics: {
      toArray: () =>
        datasetNames.map((datasetName) => ({
          attributes: { sourceId, productKey: datasetName, datasetName, productType },
        })),
    },
  };
}

test("authoritative deactivation removes only that source and reactivation does not restore items", () => {
  const lifecycle = createLifecycle();
  const coordinator = createDataSourceProductStateCoordinator({ lifecycle });
  addProductCollectionProduct("AOI-1");
  add("paper-charts", "PAPER-1", "paper-chart");
  add("s102", "S102-1", "s102-product");
  lifecycle.emit("deactivating", { sourceId: "paper-charts", reason: "user-deactivation" });
  assert.deepEqual(getProductCollectionDatasetNames(), ["AOI-1", "S102-1"]);
  lifecycle.emit("activated", {
    sourceId: "paper-charts",
    layers: [layer("paper-charts", ["PAPER-1"], "paper-chart")],
  });
  assert.deepEqual(getProductCollectionDatasetNames(), ["AOI-1", "S102-1"]);
  coordinator.destroy();
});

test("activation-failed and failed refresh without committed publication are non-destructive", () => {
  const lifecycle = createLifecycle();
  const coordinator = createDataSourceProductStateCoordinator({ lifecycle });
  add("paper-charts", "PAPER-1", "paper-chart");

  lifecycle.emit("deactivating", { sourceId: "paper-charts", reason: "activation-failed" });
  assert.deepEqual(getProductCollectionDatasetNames(), ["PAPER-1"]);

  // A failed refresh never publishes the authoritative `refreshed` event. The
  // coordinator must therefore keep the last committed Collection state unchanged.
  assert.deepEqual(getProductCollectionDatasetNames(), ["PAPER-1"]);
  coordinator.destroy();
});

test("successful guarded refresh prunes Products missing from committed source data", () => {
  const lifecycle = createLifecycle();
  const coordinator = createDataSourceProductStateCoordinator({ lifecycle });
  add("paper-charts", "PAPER-OLD", "paper-chart");
  add("paper-charts", "PAPER-KEEP", "paper-chart");
  add("s102", "S102-1", "s102-product");
  lifecycle.emit("refreshed", {
    sourceId: "paper-charts",
    layers: [layer("paper-charts", ["PAPER-KEEP", "PAPER-NEW"], "paper-chart")],
  });
  assert.deepEqual(getProductCollectionDatasetNames(), ["PAPER-KEEP", "S102-1"]);
  coordinator.destroy();
});
