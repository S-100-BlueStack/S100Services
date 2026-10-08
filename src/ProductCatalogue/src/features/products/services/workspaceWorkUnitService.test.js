import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import {
  createWorkspaceProductContext,
  createCompatibilityWorkspaceProductContext,
} from "../domain/productContext.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { createWorkspaceProductService } from "./workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "./workspaceWorkUnitService.js";

const names = { s101: "Harbour boundary", s57: "Legacy chart north" };

function harness({
  registry = createDataSourceRegistry(),
  metadata = names,
  failDetail = false,
  failExact = null,
  specificationOverride = null,
} = {}) {
  const exactCalls = [];
  const detailCalls = [];
  const productService = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (name) => {
      exactCalls.push(name);
      if (name === failExact) return { success: false, status: 404 };
      const sourceId = Object.keys(names).find((key) => names[key] === name);
      if (!sourceId) return { success: false, status: 404 };
      return {
        success: true,
        data: {
          Data: {
            Geometry: { x: 10, y: 56 },
            Attributes: {
              DatasetName: name,
              ProductSpecification:
                specificationOverride ?? registry.byId.get(sourceId).normalizer.specification,
            },
          },
        },
      };
    },
  });
  const fetchProduct = async (name) => {
    detailCalls.push(name);
    if (failDetail) return { success: false, errorMessage: "Detail unavailable" };
    return {
      success: true,
      data: normalizeElectronicProductResponse({
        Name: name,
        S101: metadata.s101 ? { Name: metadata.s101 } : null,
        S57: metadata.s57 ? { Name: metadata.s57 } : null,
      }),
    };
  };
  return {
    registry,
    productService,
    fetchProduct,
    exactCalls,
    detailCalls,
    service: createWorkspaceWorkUnitService({ registry, productService, fetchProduct }),
  };
}

test("workspace context copies and freezes the package declaration without freezing registry input", () => {
  const declaration = structuredClone(createDataSourceRegistry().byId.get("s101").workUnit);
  const product = createWorkspaceProductContext({
    sourceId: "s101",
    productKey: "arbitrary",
    datasetName: "arbitrary",
    productType: "s101-product",
    capabilities: { analyze: true },
    workUnit: declaration,
  });
  assert.deepEqual(product.workUnit, declaration);
  assert.notEqual(product.workUnit.members, declaration.members);
  assert.ok(Object.isFrozen(product.workUnit.members[0]));
  assert.equal(Object.isFrozen(declaration.members[0]), false);
  declaration.members[0].label = "Changed";
  assert.equal(product.workUnit.members[0].label, "S-101");
  assert.equal(product.capabilities.analyze, true);
});

test("registry declares ordered member sources and enables package Analyze and Review navigation and retains disabled actions", () => {
  const { registry } = harness();
  const source = registry.byId.get("s101");
  assert.deepEqual(
    source.workUnit.members.map((member) => [
      member.key,
      member.sourceId,
      member.label,
      member.exportStandard,
    ]),
    [
      ["s101", "s101", "S-101", "S100"],
      ["s57", "s57", "S-57", "S57"],
    ]
  );
  assert.deepEqual(source.workUnit.navigationCapabilities, {
    analyze: true,
    review: true,
    history: false,
  });
  for (const key of [
    "freeze",
    "unfreeze",
    "sendToIcEnc",
    "cancelExport",
    "exportEdition",
    "exportUpdate",
    "popupExport",
  ])
    assert.equal(source.capabilities[key], false);
  assert.equal(registry.byId.get("s57").userSelectable, false);
});

for (const sourceId of Object.keys(names)) {
  test(`exact ${sourceId} resolution stays exact and canonical package resolution converges`, async () => {
    const h = harness();
    const exact = await h.productService.resolveProduct(names[sourceId]);
    assert.equal(exact.product.sourceId, sourceId);
    assert.equal(exact.datasetName, names[sourceId]);
    assert.equal(exact.product.workUnit?.kind ?? null, sourceId === "s101" ? "package" : null);
    h.exactCalls.length = 0;
    const result = await h.service.resolveWorkUnit(names[sourceId]);
    assert.equal(result.status, "resolved", result.error);
    assert.equal(result.requestedDatasetName, names[sourceId]);
    assert.equal(result.datasetName, names.s101);
    assert.equal(result.product.sourceId, "s101");
    assert.deepEqual(
      result.workUnit.members.map((member) => member.datasetName),
      [names.s101, names.s57]
    );
    assert.ok(Object.isFrozen(result.workUnit.members));
    assert.equal(h.exactCalls.length, 2);
    assert.equal(h.detailCalls.length, sourceId === "s101" ? 1 : 2);
  });
}

test("both arbitrary-name entry paths have one stable source-aware package identity", async () => {
  const h = harness();
  const first = await h.service.resolveWorkUnit(names.s101);
  const second = await h.service.resolveWorkUnit(names.s57);
  assert.equal(first.workUnit.identityKey, second.workUnit.identityKey);
  assert.deepEqual(first.workUnit, second.workUnit);
  assert.deepEqual(JSON.parse(first.workUnit.identityKey), [
    "package",
    "s101",
    names.s101.toUpperCase(),
  ]);
});

for (const [label, options, request] of [
  ["missing primary", { metadata: { s57: names.s57 } }, names.s57],
  ["missing secondary", { metadata: { s101: names.s101 } }, names.s101],
  ["empty secondary", { metadata: { s101: names.s101, s57: "  " } }, names.s101],
  [
    "duplicate concrete identity",
    { metadata: { s101: names.s101, s57: names.s101.toLowerCase() } },
    names.s101,
  ],
  ["detail failure", { failDetail: true }, names.s101],
  ["canonical targeted failure", { failExact: names.s101 }, names.s57],
  ["secondary targeted failure", { failExact: names.s57 }, names.s101],
  ["contradictory requested member", { metadata: { s101: "Other", s57: names.s57 } }, names.s101],
  ["wrong resolved specification", { specificationOverride: "S57" }, names.s101],
  [
    "disabled primary source",
    { registry: createDataSourceRegistry({ configuredSourceIds: ["s57"] }) },
    names.s57,
  ],
  [
    "disabled secondary source",
    { registry: createDataSourceRegistry({ configuredSourceIds: ["s101"] }) },
    names.s101,
  ],
]) {
  test(`${label} fails closed`, async () => {
    const result = await harness(options).service.resolveWorkUnit(request);
    assert.equal(result.status, "failed");
    assert.equal(result.product, null);
    assert.equal(result.workUnit, null);
  });
}

test("canonical detail must agree with the secondary entry mapping", async () => {
  const h = harness();
  const service = createWorkspaceWorkUnitService({
    ...h,
    fetchProduct: async (name) => {
      const result = await h.fetchProduct(name);
      if (name === names.s101) result.data.workUnitMetadata.members.s57.datasetName = "Remapped";
      return result;
    },
  });
  assert.equal((await service.resolveWorkUnit(names.s57)).status, "failed");
});

test("detail top-level identity mismatch and thrown detail failure fail closed", async () => {
  for (const fetchProduct of [
    async () => ({ success: true, data: { datasetName: "Wrong" } }),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const h = harness();
    const service = createWorkspaceWorkUnitService({
      registry: h.registry,
      productService: h.productService,
      fetchProduct,
    });
    assert.equal((await service.resolveWorkUnit(names.s101)).status, "failed");
  }
});

test("registry source replacement during an async request fails closed", async () => {
  const h = harness();
  const service = createWorkspaceWorkUnitService({
    ...h,
    fetchProduct: async (name) => {
      const result = await h.fetchProduct(name);
      h.registry.byId.set("s57", { ...h.registry.byId.get("s57") });
      return result;
    },
  });
  assert.equal((await service.resolveWorkUnit(names.s101)).status, "failed");
});

test("missing, unavailable or incompatible member source fails closed", async () => {
  for (const change of [
    () => null,
    (source) => ({ ...source, availability: { state: "unavailable" } }),
    (source) => ({ ...source, normalizer: { type: "geojson-products" } }),
  ]) {
    const base = createDataSourceRegistry();
    const definitions = base.definitions
      .map((source) => (source.id === "s57" ? change(source) : source))
      .filter(Boolean);
    const registry = {
      definitions,
      byId: new Map(definitions.map((source) => [source.id, source])),
    };
    assert.equal(
      (await harness({ registry }).service.resolveWorkUnit(names.s101)).status,
      "failed"
    );
  }
});

test("simple registry and compatibility Products retain their exact resolution without detail reads", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const source = registry.byId.get("paper-charts");
  const simple = createWorkspaceProductContext({
    sourceId: source.id,
    productKey: "paper",
    datasetName: "paper",
    productType: source.productType,
    capabilities: source.capabilities,
  });
  for (const product of [simple, createCompatibilityWorkspaceProductContext("compatibility")]) {
    const exact = {
      status: "resolved",
      datasetName: product.datasetName,
      product,
      providerErrors: [],
    };
    const service = createWorkspaceWorkUnitService({
      registry,
      productService: { resolveProduct: async () => exact },
      fetchProduct: () => {
        throw new Error("Unexpected detail read");
      },
    });
    assert.deepEqual(await service.resolveWorkUnit(product.datasetName), {
      ...exact,
      requestedDatasetName: product.datasetName,
      workUnit: null,
    });
  }
});

test("exact not-found and provider ambiguity results are preserved", async () => {
  for (const result of [
    { status: "not-found", product: null },
    {
      status: "failed",
      reason: "ambiguous-dataset-name",
      product: null,
      providerErrors: [{ providerId: "other", message: "failure" }],
    },
  ]) {
    const service = createWorkspaceWorkUnitService({
      productService: { resolveProduct: async () => result },
    });
    assert.deepEqual(await service.resolveWorkUnit("Unknown"), {
      ...result,
      requestedDatasetName: "Unknown",
      workUnit: null,
    });
  }
});

test("missing primary declaration and ambiguous package ownership fail closed", async () => {
  for (const transform of [
    (source) => ({ ...source, workUnit: { ...source.workUnit, primaryMemberKey: "missing" } }),
    (source) => ({
      ...source,
      workUnit: {
        ...source.workUnit,
        members: source.workUnit.members.filter((member) => member.key !== "s101"),
      },
    }),
  ]) {
    const base = createDataSourceRegistry();
    const definitions = base.definitions.map((source) =>
      source.workUnit ? transform(source) : source
    );
    const registry = {
      definitions,
      byId: new Map(definitions.map((source) => [source.id, source])),
    };
    assert.equal((await harness({ registry }).service.resolveWorkUnit(names.s57)).status, "failed");
  }
  const base = createDataSourceRegistry();
  const definitions = [...base.definitions, { ...base.byId.get("s101"), id: "other-owner" }];
  const registry = { definitions, byId: new Map(definitions.map((source) => [source.id, source])) };
  assert.equal((await harness({ registry }).service.resolveWorkUnit(names.s57)).status, "failed");
});

test("stale package ProductContext declaration fails closed", async () => {
  const h = harness();
  const result = await h.productService.resolveProduct(names.s101);
  const service = createWorkspaceWorkUnitService({
    ...h,
    productService: {
      resolveProduct: async () => ({ ...result, product: { ...result.product, workUnit: null } }),
    },
  });
  assert.equal((await service.resolveWorkUnit(names.s101)).status, "failed");
});

test("force resolution options reach each exact member once", async () => {
  const h = harness();
  const calls = [];
  const service = createWorkspaceWorkUnitService({
    ...h,
    productService: {
      resolveProduct: async (name, options) => {
        calls.push([name, options]);
        return h.productService.resolveProduct(name, options);
      },
    },
  });
  assert.equal((await service.resolveWorkUnit(names.s57, { force: true })).status, "resolved");
  assert.deepEqual(calls, [
    [names.s57, { force: true }],
    [names.s101, { force: true }],
  ]);
});

test("secondary owner reference prevents fallback when the primary registry source is missing", async () => {
  const base = createDataSourceRegistry();
  assert.equal(base.byId.get("s57").workspace.workUnitSourceId, "s101");
  const definitions = base.definitions.filter((source) => source.id !== "s101");
  const registry = { definitions, byId: new Map(definitions.map((source) => [source.id, source])) };
  assert.equal((await harness({ registry }).service.resolveWorkUnit(names.s57)).status, "failed");
});

test("contradictory normalized member source identity fails closed", async () => {
  const h = harness();
  const service = createWorkspaceWorkUnitService({
    ...h,
    productService: {
      resolveProduct: async (name, options) => {
        const result = await h.productService.resolveProduct(name, options);
        return {
          ...result,
          product: {
            ...result.product,
            data: {
              ...result.product.data,
              attributes: { ...result.product.data.attributes, sourceId: "other" },
            },
          },
        };
      },
    },
  });
  assert.equal((await service.resolveWorkUnit(names.s101)).status, "failed");
});

test("explicit secondary owner reference cannot fall back when the owner omits the member", async () => {
  const base = createDataSourceRegistry();
  const definitions = base.definitions.map((source) =>
    source.id === "s101"
      ? {
          ...source,
          workUnit: {
            ...source.workUnit,
            members: source.workUnit.members.filter((member) => member.sourceId !== "s57"),
          },
        }
      : source
  );
  const registry = { definitions, byId: new Map(definitions.map((source) => [source.id, source])) };
  const h = harness({ registry });
  const result = await h.service.resolveWorkUnit(names.s57);
  assert.equal(result.status, "failed");
  assert.equal(result.product, null);
  assert.equal(result.workUnit, null);
  assert.deepEqual(h.detailCalls, []);
});

for (const entry of ["s101", "s57"]) {
  test(`${entry} entry fails closed when the secondary references another package owner`, async () => {
    const base = createDataSourceRegistry();
    const primary = base.byId.get("s101");
    const otherOwner = {
      ...primary,
      id: "other-owner",
      workUnit: {
        ...primary.workUnit,
        members: primary.workUnit.members.map((member) =>
          member.key === primary.workUnit.primaryMemberKey
            ? { ...member, sourceId: "other-owner" }
            : member
        ),
      },
    };
    const definitions = [
      ...base.definitions.map((source) =>
        source.id === "s57"
          ? { ...source, workspace: { ...source.workspace, workUnitSourceId: "other-owner" } }
          : source
      ),
      otherOwner,
    ];
    const registry = {
      definitions,
      byId: new Map(definitions.map((source) => [source.id, source])),
    };
    const h = harness({ registry });
    const result = await h.service.resolveWorkUnit(names[entry]);
    assert.equal(result.status, "failed");
    assert.equal(result.product, null);
    assert.equal(result.workUnit, null);
    assert.deepEqual(h.detailCalls, []);
  });
}
