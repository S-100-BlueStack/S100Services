import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { filterProductCatalog, normalizeProductCatalog } from "../domain/productCatalog.js";
import {
  WORKSPACE_PRODUCT_RESOLUTION_STATUS,
  createWorkspaceProductService,
} from "./workspaceProductService.js";

function normalizedSource(source, entries) {
  const features = entries.map((entry) => {
    const product = typeof entry === "string" ? { datasetName: entry } : entry;
    const datasetName = product.datasetName;
    const productKey = product.productKey ?? datasetName;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [10, 56] },
      properties: {
        sourceId: source.id,
        sourceLabel: source.label,
        productType: source.productType,
        productKey,
        datasetName,
        productName: product.productName ?? product.displayName ?? datasetName,
        status: "Available",
      },
    };
  });
  return {
    products: features.map((feature) => feature.properties),
    layers: [{ data: { type: "FeatureCollection", features } }],
  };
}

function createService({
  failSourceId = null,
  compatibility = ["AOI-1"],
  paperProducts = ["PAPER-1"],
  s102Products = ["S102-1"],
} = {}) {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  return createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => ({ Data: compatibility }),
    loadSource: async (source) => {
      if (source.id === failSourceId) throw new Error(`${source.id} failed`);
      return source.id === "paper-charts" ? paperProducts : s102Products;
    },
    normalizeSource: (entries, source) => normalizedSource(source, entries),
  });
}

test("catalog merges compatibility, Paper Charts and S-102 with source metadata", async () => {
  const service = createService();
  const catalog = await service.loadCatalog();
  assert.deepEqual(
    catalog.map((item) => item.name),
    ["AOI-1", "PAPER-1", "S102-1"]
  );
  assert.equal(catalog.find((item) => item.name === "PAPER-1").sourceId, "paper-charts");
  assert.equal(catalog.find((item) => item.name === "S102-1").productType, "s102-product");
});

test("same visible Product name remains independently resolvable through authoritative datasetName", async () => {
  const service = createService({
    compatibility: [{ name: "1149E", datasetName: "101DK0041149E" }],
    paperProducts: [],
    s102Products: [{ productName: "1149E", datasetName: "102DK0041149E" }],
  });

  const catalog = await service.loadCatalog();
  assert.deepEqual(
    catalog.map((item) => item.datasetName),
    ["101DK0041149E", "102DK0041149E"]
  );
  assert.deepEqual(
    catalog.map((item) => item.displayName),
    ["1149E", "1149E"]
  );
  const pickerCatalog = normalizeProductCatalog(catalog);
  assert.deepEqual(
    pickerCatalog.map((item) => item.name),
    ["101DK0041149E", "102DK0041149E"]
  );
  assert.deepEqual(
    pickerCatalog.map((item) => item.displayName),
    ["1149E", "1149E"]
  );
  assert.deepEqual(
    filterProductCatalog(pickerCatalog, "1149E").map((item) => item.name),
    ["101DK0041149E", "102DK0041149E"]
  );

  const compatibility = await service.resolveProduct("101DK0041149E");
  const s102 = await service.resolveProduct("102DK0041149E");
  assert.equal(compatibility.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(compatibility.product.sourceId, "compatibility-aoi");
  assert.equal(compatibility.product.datasetName, "101DK0041149E");
  assert.equal(s102.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(s102.product.sourceId, "s102");
  assert.equal(s102.product.datasetName, "102DK0041149E");
  assert.equal(s102.product.data.attributes.productName, "1149E");
});

test("resolver returns source-aware Products and fails closed for unavailable or unknown names", async () => {
  const service = createService();
  const compatibility = await service.resolveProduct("AOI-1");
  const paper = await service.resolveProduct("PAPER-1");
  const s102 = await service.resolveProduct("S102-1");
  const s57 = await service.resolveProduct("S57-NOT-AVAILABLE");
  assert.equal(compatibility.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(compatibility.product.sourceId, "compatibility-aoi");
  assert.equal(paper.product.sourceId, "paper-charts");
  assert.equal(paper.product.data.feature.properties.datasetName, "PAPER-1");
  assert.equal(s102.product.sourceId, "s102");
  assert.equal(s57.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND);
});

test("duplicate normalized datasetName across providers fails closed instead of selecting a Product", async () => {
  const service = createService({
    compatibility: [{ name: "Compatibility 1149E", datasetName: "101DK0041149E" }],
    paperProducts: [],
    s102Products: [{ productName: "S-102 1149E", datasetName: "101dk0041149e" }],
  });

  const catalog = await service.loadCatalog();
  assert.equal(
    catalog.some((item) => item.datasetName.toUpperCase() === "101DK0041149E"),
    false
  );
  assert.equal(catalog.incomplete, true);
  assert.equal(catalog.identityErrors.length, 1);
  assert.equal(catalog.identityErrors[0].reason, "ambiguous-dataset-name");
  const pickerCatalog = normalizeProductCatalog(catalog);
  assert.equal(pickerCatalog.incomplete, true);
  assert.equal(pickerCatalog.identityErrors.length, 1);

  const resolved = await service.resolveProduct("101DK0041149E");
  assert.equal(resolved.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED);
  assert.equal(resolved.reason, "ambiguous-dataset-name");
  assert.equal(resolved.product, null);
  assert.deepEqual(resolved.identityError.providers.map((provider) => provider.sourceId).sort(), [
    "compatibility-aoi",
    "s102",
  ]);
});

test("one provider failure is isolated and missing resolution fails rather than faking not-found", async () => {
  const service = createService({ failSourceId: "paper-charts" });
  const catalog = await service.loadCatalog();
  assert.equal(
    catalog.some((item) => item.name === "AOI-1"),
    true
  );
  assert.equal(
    catalog.some((item) => item.name === "S102-1"),
    true
  );
  assert.equal(catalog.incomplete, true);
  const paper = await service.resolveProduct("PAPER-1");
  assert.equal(paper.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED);
});

test("stale provider load cannot replace a newer committed workspace snapshot", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true, configuredSourceIds: [] });
  const deferred = [];
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: () => new Promise((resolve) => deferred.push(resolve)),
  });
  const older = service.loadCatalog({ force: true });
  const newer = service.loadCatalog({ force: true });
  deferred[1]({ Data: ["NEW"] });
  await newer;
  deferred[0]({ Data: ["OLD"] });
  await older;
  assert.equal(
    (await service.resolveProduct("NEW")).status,
    WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED
  );
  assert.equal(
    (await service.resolveProduct("OLD")).status,
    WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND
  );
});
