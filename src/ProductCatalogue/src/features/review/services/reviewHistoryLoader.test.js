import assert from "node:assert/strict";
import test from "node:test";

import { REVIEW_PRODUCT_LOAD_STATE, loadReviewHistories } from "./reviewHistoryLoader.js";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";

function context(sourceId, datasetName) {
  return { sourceId, sourceLabel: sourceId, datasetName, productType: `${sourceId}-product` };
}

test("compatibility History remains loaded while mock History is unavailable", async () => {
  const contexts = new Map([
    ["AOI-1", context("compatibility-aoi", "AOI-1")],
    ["PAPER-1", context("paper-charts", "PAPER-1")],
    ["S102-1", context("s102", "S102-1")],
  ]);
  const historyCalls = [];
  const results = await loadReviewHistories([...contexts.keys()], {
    workspaceProductService: {
      resolveProduct: async (name) => ({ status: "resolved", product: contexts.get(name) }),
    },
    fetchHistory: async (name, options) => {
      historyCalls.push([name, options.productContext.sourceId]);
      return {
        endpointAvailable: options.productContext.sourceId === "compatibility-aoi",
        events: [],
      };
    },
  });
  assert.deepEqual(
    results.map((item) => item.loadState),
    [
      REVIEW_PRODUCT_LOAD_STATE.LOADED,
      REVIEW_PRODUCT_LOAD_STATE.UNAVAILABLE,
      REVIEW_PRODUCT_LOAD_STATE.UNAVAILABLE,
    ]
  );
  assert.deepEqual(
    historyCalls.map((call) => call[1]),
    ["compatibility-aoi", "paper-charts", "s102"]
  );
});

test("Review isolates failed Product resolution from other columns", async () => {
  const results = await loadReviewHistories(["AOI-1", "BROKEN"], {
    workspaceProductService: {
      resolveProduct: async (name) =>
        name === "BROKEN"
          ? { status: "failed", error: "Provider failed" }
          : { status: "resolved", product: context("compatibility-aoi", name) },
    },
    fetchHistory: async () => ({ endpointAvailable: true, events: [] }),
  });
  assert.equal(results[0].loadState, REVIEW_PRODUCT_LOAD_STATE.LOADED);
  assert.equal(results[1].loadState, REVIEW_PRODUCT_LOAD_STATE.FAILED);
  assert.equal(results[1].error, "Provider failed");
});

function createIdentityWorkspaceService() {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  return createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => ({
      Data: [{ name: "1149E", datasetName: "101DK0041149E" }],
    }),
    loadSource: async (source) => {
      if (source.id === "paper-charts") {
        return [];
      }
      return [{ datasetName: "102DK0041149E", productName: "1149E" }];
    },
    normalizeSource: (entries, source) => {
      const features = entries.map((entry) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [10, 56] },
        properties: {
          sourceId: source.id,
          sourceLabel: source.label,
          productType: source.productType,
          productKey: `${source.id}:1149E`,
          datasetName: entry.datasetName,
          productName: entry.productName,
          status: "Available",
        },
      }));
      return {
        products: features.map((feature) => feature.properties),
        layers: [{ data: { type: "FeatureCollection", features } }],
      };
    },
  });
}

test("Review resolves same visible Product name independently by datasetName", async () => {
  const workspaceProductService = createIdentityWorkspaceService();
  const historyCalls = [];
  const results = await loadReviewHistories(["101DK0041149E", "102DK0041149E"], {
    workspaceProductService,
    fetchHistory: async (datasetName, { productContext }) => {
      historyCalls.push([datasetName, productContext.sourceId]);
      return {
        endpointAvailable: productContext.sourceId === "compatibility-aoi",
        availabilityReason:
          productContext.sourceId === "compatibility-aoi" ? null : "History unavailable",
        events: [],
      };
    },
  });

  assert.deepEqual(historyCalls, [
    ["101DK0041149E", "compatibility-aoi"],
    ["102DK0041149E", "s102"],
  ]);
  assert.deepEqual(
    results.map((product) => [product.datasetName, product.sourceId, product.loadState]),
    [
      ["101DK0041149E", "compatibility-aoi", REVIEW_PRODUCT_LOAD_STATE.LOADED],
      ["102DK0041149E", "s102", REVIEW_PRODUCT_LOAD_STATE.UNAVAILABLE],
    ]
  );
});
