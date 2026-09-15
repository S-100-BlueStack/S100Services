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
    const datasetName = product.datasetName ?? product.name;
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
        productName: product.productName ?? product.displayName ?? product.name ?? datasetName,
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
      return { s57: [], s101: compatibility, "paper-charts": paperProducts, s102: s102Products }[
        source.id
      ];
    },
    normalizeSource: (entries, source) => normalizedSource(source, entries),
    loadTargetedProduct: null,
  });
}

test("catalog merges S-101, Paper Charts and S-102 with source metadata", async () => {
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
  assert.equal(compatibility.product.sourceId, "s101");
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
  assert.equal(compatibility.product.sourceId, "s101");
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
    "s101",
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
  const registry = createDataSourceRegistry({ isDevelopment: true, configuredSourceIds: ["s101"] });
  const deferred = [];
  const service = createWorkspaceProductService({
    registry,
    loadSource: () => new Promise((resolve) => deferred.push(resolve)),
    normalizeSource: (entries, source) => normalizedSource(source, entries),
    loadTargetedProduct: null,
  });
  const older = service.loadCatalog({ force: true });
  const newer = service.loadCatalog({ force: true });
  deferred[1](["NEW"]);
  await newer;
  deferred[0](["OLD"]);
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

test("targeted resolver selects the authoritative electronic source without loading full AOI catalogs", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  const bulkCalls = [];
  const targetedCalls = [];
  const service = createWorkspaceProductService({
    registry,
    loadSource: async (source) => {
      bulkCalls.push(source.id);
      throw new Error("Bulk AOI source must not be loaded during targeted resolution.");
    },
    loadTargetedProduct: async (datasetName) => {
      targetedCalls.push(datasetName);
      return {
        success: true,
        status: 200,
        data: {
          Data: {
            Geometry: JSON.stringify({
              rings: [
                [
                  [10, 56],
                  [11, 56],
                  [10, 56],
                ],
              ],
            }),
            Attributes: {
              DatasetName: datasetName,
              ProductSpecification: "S-57",
              Status: 8,
              DisplayScale: 25000,
              UsageBand: 3,
            },
          },
        },
      };
    },
  });

  const resolved = await service.resolveProduct("DK0000001");

  assert.deepEqual(targetedCalls, ["DK0000001"]);
  assert.deepEqual(bulkCalls, []);
  assert.equal(resolved.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(resolved.product.sourceId, "s57");
  assert.equal(resolved.product.datasetName, "DK0000001");
  assert.deepEqual(resolved.product.data.geometry, {
    rings: [
      [
        [10, 56],
        [11, 56],
        [10, 56],
      ],
    ],
  });
});

test("targeted resolver derives S-101 from backend product specification rather than dataset-name heuristics", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  const service = createWorkspaceProductService({
    registry,
    loadSource: async () => {
      throw new Error("Bulk AOI source must not be loaded during targeted resolution.");
    },
    loadTargetedProduct: async (datasetName) => ({
      success: true,
      status: 200,
      data: {
        Data: {
          Geometry: {
            rings: [
              [
                [10, 56],
                [11, 56],
                [10, 56],
              ],
            ],
          },
          Attributes: {
            DatasetName: datasetName,
            ProductSpecification: "S101",
          },
        },
      },
    }),
  });

  const resolved = await service.resolveProduct("NAME-WITHOUT-STANDARD-PREFIX");

  assert.equal(resolved.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(resolved.product.sourceId, "s101");
  assert.equal(resolved.product.datasetName, "NAME-WITHOUT-STANDARD-PREFIX");
});

test("targeted resolver fails closed for identity conflicts and malformed source metadata", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  const conflict = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async () => ({
      success: false,
      status: 409,
      statusText: "Conflict",
      data: { Message: "The electronic product identity is ambiguous or invalid." },
    }),
  });
  const malformed = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (datasetName) => ({
      success: true,
      status: 200,
      data: {
        Data: {
          Geometry: {
            rings: [
              [
                [10, 56],
                [11, 56],
                [10, 56],
              ],
            ],
          },
          Attributes: { DatasetName: datasetName },
        },
      },
    }),
  });

  const conflictResult = await conflict.resolveProduct("DUPLICATE");
  const malformedResult = await malformed.resolveProduct("MISSING-SPEC");

  assert.equal(conflictResult.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED);
  assert.equal(conflictResult.providerErrors[0].providerId, "targeted-product-aoi");
  assert.match(conflictResult.providerErrors[0].message, /ambiguous or invalid/i);
  assert.equal(malformedResult.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED);
  assert.match(malformedResult.providerErrors[0].message, /product specification/i);
});

test("targeted resolver treats backend 404 as not found without falling back to bulk sources", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  let bulkCalls = 0;
  const service = createWorkspaceProductService({
    registry,
    loadSource: async () => {
      bulkCalls += 1;
      return [];
    },
    loadTargetedProduct: async () => ({
      success: false,
      status: 404,
      statusText: "Not Found",
      data: { Message: "Not found" },
    }),
  });

  const resolved = await service.resolveProduct("UNKNOWN");

  assert.equal(resolved.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(bulkCalls, 0);
});
