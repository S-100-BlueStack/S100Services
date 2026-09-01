import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
} from "../../products/domain/productContext.js";
import {
  canUseCompatibilityProductBackend,
  fetchPopupProductRefresh,
  initializePopupBackendSynchronization,
  mergePopupProductRefreshAttributes,
} from "./popupBackendSync.js";

function createSourceContext(sourceId, productType) {
  return createWorkspaceProductContext({
    sourceId,
    sourceLabel: sourceId === "s102" ? "S-102" : "Paper Charts",
    productKey: `${sourceId}-key`,
    datasetName: sourceId === "s102" ? "102DK0041149E" : "PAPER-MOCK-P001",
    productType,
    capabilities: {
      productCollection: true,
      analyze: true,
      review: true,
      backendProductRefresh: false,
    },
  });
}

function createSpies() {
  const calls = { watch: [], register: [] };
  return {
    calls,
    watchActiveProductJobs(datasetName) {
      calls.watch.push(datasetName);
      return () => {};
    },
    registerPopupRefreshHandler(registration) {
      calls.register.push(registration);
      return () => {};
    },
  };
}

function initialize(productContext) {
  const spies = createSpies();
  const sync = initializePopupBackendSynchronization({
    productContext,
    datasetName: productContext?.datasetName ?? "UNKNOWN",
    refresh: async () => true,
    watchActiveProductJobs: spies.watchActiveProductJobs,
    registerPopupRefreshHandler: spies.registerPopupRefreshHandler,
  });
  return { sync, ...spies };
}

test("compatibility Analyze popup preserves active-job watch and selected-Product refresh registration", () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041149E");
  const { sync, calls } = initialize(context);

  assert.equal(canUseCompatibilityProductBackend(context), true);
  assert.equal(sync.enabled, true);
  assert.deepEqual(calls.watch, ["101DK0041149E"]);
  assert.equal(calls.register.length, 1);
  assert.equal(calls.register[0].datasetName, "101DK0041149E");
});

test("S-102 Analyze popup performs no compatibility backend synchronization", () => {
  const context = createSourceContext("s102", "s102-product");
  const { sync, calls } = initialize(context);

  assert.equal(canUseCompatibilityProductBackend(context), false);
  assert.equal(sync.enabled, false);
  assert.deepEqual(calls.watch, []);
  assert.deepEqual(calls.register, []);
});

test("Paper Charts Analyze popup performs no compatibility backend synchronization", () => {
  const context = createSourceContext("paper-charts", "paper-chart");
  const { sync, calls } = initialize(context);

  assert.equal(sync.enabled, false);
  assert.deepEqual(calls.watch, []);
  assert.deepEqual(calls.register, []);
});

test("unresolved ProductContext fails closed with no compatibility synchronization", () => {
  const { sync, calls } = initialize(null);

  assert.equal(canUseCompatibilityProductBackend(null), false);
  assert.equal(sync.enabled, false);
  assert.deepEqual(calls.watch, []);
  assert.deepEqual(calls.register, []);
});

test("compatibility popup dispatches selected-Product refresh while mock and unresolved contexts dispatch none", async () => {
  const calls = [];
  const fetchProduct = async (datasetName) => {
    calls.push(datasetName);
    return { success: true, data: { datasetName } };
  };
  const compatibility = createCompatibilityWorkspaceProductContext("101DK0041149E");
  const s102 = createSourceContext("s102", "s102-product");
  const paper = createSourceContext("paper-charts", "paper-chart");

  const compatibilityResult = await fetchPopupProductRefresh({
    productContext: compatibility,
    datasetName: compatibility.datasetName,
    fetchProduct,
  });
  const s102Result = await fetchPopupProductRefresh({
    productContext: s102,
    datasetName: s102.datasetName,
    fetchProduct,
  });
  const paperResult = await fetchPopupProductRefresh({
    productContext: paper,
    datasetName: paper.datasetName,
    fetchProduct,
  });
  const unresolvedResult = await fetchPopupProductRefresh({
    productContext: null,
    datasetName: "UNKNOWN",
    fetchProduct,
  });

  assert.equal(compatibilityResult.dispatched, true);
  assert.equal(s102Result.dispatched, false);
  assert.equal(paperResult.dispatched, false);
  assert.equal(unresolvedResult.dispatched, false);
  assert.deepEqual(calls, ["101DK0041149E"]);
});

test("compatibility refresh cannot overwrite authoritative Graphic Product identity", () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041149E");
  const merged = mergePopupProductRefreshAttributes(context, {
    datasetName: "WRONG-DATASET",
    sourceId: "s102",
    sourceLabel: "S-102",
    productKey: "WRONG-KEY",
    productIdentityKey: '["s102","WRONG-KEY"]',
    productType: "s102-product",
    status: "Ready",
  });

  assert.equal(merged.datasetName, "101DK0041149E");
  assert.equal(merged.sourceId, "compatibility-aoi");
  assert.equal(merged.productKey, "101DK0041149E");
  assert.equal(merged.productIdentityKey, '["compatibility-aoi","101DK0041149E"]');
  assert.equal(merged.productType, "compatibility-product");
  assert.equal(merged.status, "Ready");
});
