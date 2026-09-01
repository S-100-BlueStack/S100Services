import assert from "node:assert/strict";
import test from "node:test";

import { fetchAnalyzeProducts } from "./analyzeApi.js";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import {
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
} from "../../products/domain/productContext.js";

const unavailableContent = {
  history: {
    visible: true,
    implemented: false,
    loaderId: null,
    availabilityReason: "History unavailable",
  },
  icEncReports: {
    visible: true,
    implemented: false,
    loaderId: null,
    availabilityReason: "Reports unavailable",
  },
  internalValidation: {
    visible: true,
    implemented: false,
    loaderId: null,
    availabilityReason: "Validation unavailable",
  },
};

function resolved(product) {
  return { status: "resolved", product, providerErrors: [] };
}

function mockContext(sourceId, label, datasetName, productType) {
  return createWorkspaceProductContext({
    sourceId,
    sourceLabel: label,
    productKey: datasetName,
    datasetName,
    productType,
    capabilities: { analyze: true, history: true, icEncReports: true, internalValidation: true },
    contentConfiguration: unavailableContent,
    data: {
      attributes: { datasetName, status: "MockStatus", displayScale: 25000 },
      feature: {
        type: "Feature",
        properties: { datasetName },
        geometry: { type: "Point", coordinates: [10, 56] },
      },
    },
  });
}

test("compatibility Analyze keeps the existing AOI endpoint", async () => {
  const calls = [];
  const product = createCompatibilityWorkspaceProductContext("AOI-1");
  const [result] = await fetchAnalyzeProducts(["AOI-1"], {
    workspaceProductService: { resolveProduct: async () => resolved(product) },
    get: async (...args) => {
      calls.push(args);
      return { Data: { Name: "AOI-1", Geometry: { rings: [] }, Status: 4 } };
    },
  });
  assert.equal(calls[0][0], "electronicproducts/AOI-1/aoi");
  assert.equal(result.workspaceLoadState, "loaded");
  assert.ok(result.aoiGeometry);
});

test("Paper Charts and S-102 use source-owned geometry without compatibility requests or fabricated content", async () => {
  const contexts = new Map([
    ["PAPER-1", mockContext("paper-charts", "Paper Charts", "PAPER-1", "paper-chart")],
    ["S102-1", mockContext("s102", "S-102", "S102-1", "s102-product")],
  ]);
  let getCalls = 0;
  const results = await fetchAnalyzeProducts([...contexts.keys()], {
    workspaceProductService: { resolveProduct: async (name) => resolved(contexts.get(name)) },
    get: async () => {
      getCalls += 1;
      throw new Error("must not be called");
    },
  });
  assert.equal(getCalls, 0);
  for (const result of results) {
    assert.equal(result.workspaceLoadState, "loaded");
    assert.ok(result.sourceFeature?.geometry);
    assert.equal(result.aoiGeometry, null);
    assert.equal(result.xml, null);
    assert.deepEqual(result.internalValidationReports, []);
    assert.equal(result.isMock, false);
    assert.equal(result.contentAvailability.history.implemented, false);
  }
});

test("mixed Analyze returns local failed Product without dropping successful Products", async () => {
  const paper = mockContext("paper-charts", "Paper Charts", "PAPER-1", "paper-chart");
  const results = await fetchAnalyzeProducts(["PAPER-1", "BROKEN"], {
    workspaceProductService: {
      resolveProduct: async (name) =>
        name === "PAPER-1"
          ? resolved(paper)
          : { status: "failed", product: null, error: "Provider failed" },
    },
    get: async () => {
      throw new Error("must not be called");
    },
  });
  assert.equal(results[0].workspaceLoadState, "loaded");
  assert.equal(results[1].workspaceLoadState, "failed");
  assert.equal(results[1].loadError, "Provider failed");
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
          displayScale: 25000,
        },
      }));
      return {
        products: features.map((feature) => feature.properties),
        layers: [{ data: { type: "FeatureCollection", features } }],
      };
    },
  });
}

test("Analyze resolves S-102 by authoritative datasetName and mixed routes keep source identity", async () => {
  const workspaceProductService = createIdentityWorkspaceService();
  const calls = [];
  const get = async (endpoint) => {
    calls.push(endpoint);
    return {
      Data: {
        DatasetName: "101DK0041149E",
        Geometry: { rings: [] },
        Status: 4,
      },
    };
  };

  const [s102Only] = await fetchAnalyzeProducts(["102DK0041149E"], {
    workspaceProductService,
    get,
  });
  assert.equal(calls.length, 0);
  assert.equal(s102Only.datasetName, "102DK0041149E");
  assert.equal(s102Only.sourceId, "s102");
  assert.equal(s102Only.productType, "s102-product");
  assert.equal(s102Only.productContext.sourceId, "s102");
  assert.equal(s102Only.sourceFeature.properties.datasetName, "102DK0041149E");

  const mixed = await fetchAnalyzeProducts(["101DK0041149E", "102DK0041149E"], {
    workspaceProductService,
    get,
  });
  assert.deepEqual(calls, ["electronicproducts/101DK0041149E/aoi"]);
  assert.deepEqual(
    mixed.map((product) => [product.datasetName, product.sourceId]),
    [
      ["101DK0041149E", "compatibility-aoi"],
      ["102DK0041149E", "s102"],
    ]
  );
});
