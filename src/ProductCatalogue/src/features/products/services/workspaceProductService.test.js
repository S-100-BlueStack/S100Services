import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../../dataSources/services/dataSourceNormalizer.js";
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
    normalizeSource: (entries, source) =>
      source.workspace.resolution === "targeted-product-aoi"
        ? normalizeDataSourcePayload(entries, source)
        : normalizedSource(source, entries),
    loadTargetedProduct: async (datasetName) => {
      const exists = compatibility.some(
        (entry) =>
          (typeof entry === "string" ? entry : (entry.datasetName ?? entry.name)).toUpperCase() ===
          datasetName.toUpperCase()
      );
      return exists ? targetedResponse(datasetName) : { success: false, status: 404 };
    },
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
  await service.loadCatalog();
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
  const registry = createDataSourceRegistry({ isDevelopment: true, configuredSourceIds: ["s101"] });
  const deferred = [];
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: () => new Promise((resolve) => deferred.push(resolve)),
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

function targetedResponse(datasetName, specification = "S101") {
  return {
    success: true,
    status: 200,
    data: {
      Data: {
        Geometry: { x: 10, y: 56 },
        Attributes: {
          DatasetName: datasetName,
          ProductSpecification: specification,
          Status: 8,
        },
      },
    },
  };
}

test("catalog choices and forced resolution never load electronic bulk AOIs", async () => {
  const calls = [];
  const service = createWorkspaceProductService({
    loadCompatibilityCatalog: async () => {
      calls.push("names");
      return { Data: ["S57-ONE", "S101-ONE"] };
    },
    loadSource: async () => {
      throw new Error("Electronic bulk AOI must not be loaded");
    },
    loadTargetedProduct: async (name) => {
      calls.push(name);
      return targetedResponse(name, name === "S57-ONE" ? "S57" : "S101");
    },
  });
  assert.equal((await service.loadCatalog()).length, 2);
  assert.equal((await service.resolveProduct("S57-ONE")).product.sourceId, "s57");
  assert.equal(
    (await service.resolveProduct("S101-ONE", { force: true })).product.sourceId,
    "s101"
  );
  assert.deepEqual(calls, ["names", "S57-ONE", "S101-ONE"]);
});

test("targeted resolution rejects a conflicting returned dataset identity", async () => {
  const service = createWorkspaceProductService({
    loadTargetedProduct: async () => targetedResponse("OTHER"),
  });
  const result = await service.resolveProduct("EXPECTED");
  assert.equal(result.status, "failed");
  assert.match(result.providerErrors[0].message, /identity mismatch/);
});

test("catalog excludes electronic names when only a non-electronic workspace source is configured", async () => {
  const registry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: ["s102"],
  });
  const calls = [];
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => {
      calls.push("electronic-names");
      return { Data: ["ELECTRONIC-1"] };
    },
    loadSource: async (source) => {
      calls.push(source.id);
      return ["S102-1"];
    },
    normalizeSource: (entries, source) => normalizedSource(source, entries),
  });

  const catalog = await service.loadCatalog();
  assert.deepEqual(calls, ["s102"]);
  assert.deepEqual(
    catalog.map(({ name, sourceId }) => [name, sourceId]),
    [["S102-1", "s102"]]
  );
  assert.equal(catalog.incomplete, false);
});

test("direct and forced resolution skip targeted requests when electronic sources are configured out", async () => {
  const registry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: ["s102"],
  });
  const sourceCalls = [];
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => {
      assert.fail("Configured-out electronic sources must not load the name catalog.");
    },
    loadTargetedProduct: async () => {
      assert.fail("Configured-out electronic sources must not issue targeted Product requests.");
    },
    loadSource: async (source) => {
      sourceCalls.push(source.id);
      return ["S102-1"];
    },
    normalizeSource: (entries, source) => normalizedSource(source, entries),
  });

  const product = await service.resolveProduct("S102-1");
  assert.equal(product.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(product.product.sourceId, "s102");
  assert.equal((await service.resolveProduct("ELECTRONIC-1")).status, "not-found");
  assert.equal((await service.resolveProduct("UNKNOWN", { force: true })).status, "not-found");
  assert.deepEqual(sourceCalls, ["s102", "s102"]);
});

test("unavailable targeted definitions do not activate electronic catalog or targeted resolution", async () => {
  const configured = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: ["s101", "s102"],
  });
  const definitions = configured.definitions.map((source) =>
    source.workspace.resolution === "targeted-product-aoi"
      ? {
          ...source,
          availability: { state: "unavailable", reason: "Unavailable in this environment." },
        }
      : source
  );
  const registry = { definitions, byId: new Map(definitions.map((source) => [source.id, source])) };
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => assert.fail("Unavailable catalog must not load."),
    loadTargetedProduct: async () => assert.fail("Unavailable targeted provider must not load."),
    loadSource: async () => ["S102-1"],
    normalizeSource: (entries, source) => normalizedSource(source, entries),
  });

  assert.deepEqual(
    (await service.loadCatalog()).map((product) => product.name),
    ["S102-1"]
  );
  assert.equal((await service.resolveProduct("ELECTRONIC-1")).status, "not-found");
});

for (const [configuredSpecification, returnedSpecification] of [
  ["s101", "S57"],
  ["s57", "S101"],
]) {
  test(`targeted ${returnedSpecification} identity is not reinterpreted as configured ${configuredSpecification}`, async () => {
    const registry = createDataSourceRegistry({ configuredSourceIds: [configuredSpecification] });
    const calls = [];
    const name = `${configuredSpecification.toUpperCase()}-MISLEADING-NAME`;
    const service = createWorkspaceProductService({
      registry,
      loadCompatibilityCatalog: async () => {
        calls.push("names");
        return { Data: [name] };
      },
      loadSource: async () => assert.fail("Electronic bulk AOIs must not load."),
      loadTargetedProduct: async (datasetName) => {
        calls.push(datasetName);
        return targetedResponse(datasetName, returnedSpecification);
      },
    });

    assert.deepEqual(
      (await service.loadCatalog()).map((product) => product.name),
      [name]
    );
    const result = await service.resolveProduct(name);
    assert.equal(result.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND);
    assert.equal(result.product, null);
    assert.deepEqual(calls, ["names", name]);
  });
}

test("non-electronic provider failures remain failed when no targeted source is available", async () => {
  const registry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: ["s102"],
  });
  const service = createWorkspaceProductService({
    registry,
    loadCompatibilityCatalog: async () => assert.fail("Disabled catalog must not load."),
    loadTargetedProduct: async () => assert.fail("Disabled targeted provider must not load."),
    loadSource: async () => {
      throw new Error("Non-electronic provider failed.");
    },
  });

  const result = await service.resolveProduct("UNKNOWN");
  assert.equal(result.status, WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED);
  assert.equal(result.providerErrors[0].providerId, "s102");
  assert.match(result.providerErrors[0].message, /Non-electronic provider failed/);
});
