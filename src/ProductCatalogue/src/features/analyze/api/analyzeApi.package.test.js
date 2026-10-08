import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { fetchAnalyzeProducts, resolveAnalyzeWorkUnits } from "./analyzeApi.js";
import {
  canonicalizeAnalyzeItems,
  retainAcceptedAnalyzePackages,
  mergeAnalyzeRefresh,
} from "../domain/analyzeWorkUnits.js";
import {
  createAnalyzeDatasetItems,
  getEnabledAnalyzeDatasetNames,
  toggleAnalyzeDatasetItem,
  removeAnalyzeDatasetItem,
} from "../domain/analyzeDatasetList.js";
import {
  createCompatibilityAnalyzeEntry,
  createSourceAnalyzeEntry,
} from "../map/analyzeGraphicProductContext.js";
import { loadAnalyzeProductHistories } from "../services/analyzeHistoryLoader.js";
import { buildWorkspaceUrl, parseWorkspaceRoute } from "../../../shared/routing/workspaceRoute.js";

const names = ["Harbour boundary & east", "Legacy chart north"];
const geometry = { x: 10, y: 56, spatialReference: { wkid: 4326 } };
function harness({
  missing = null,
  failExact = null,
  missingGeometry = false,
  contradictory = false,
} = {}) {
  const registry = createDataSourceRegistry();
  const exactCalls = [];
  const detailCalls = [];
  const getCalls = [];
  const productService = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (name) => {
      exactCalls.push(name);
      const index = names.indexOf(name);
      if (index < 0 || name === failExact) return { success: false, status: 404 };
      return {
        success: true,
        data: {
          Data: {
            Geometry: missingGeometry ? null : geometry,
            Attributes: { DatasetName: name, ProductSpecification: index ? "S57" : "S101" },
          },
        },
      };
    },
  });
  const payload = (name) => ({
    Name: name,
    Status: name === names[0] ? 8 : 11,
    Edition: name === names[0] ? 3 : 7,
    Update: name === names[0] ? 2 : 4,
    S101: missing === "s101" ? null : { Name: names[0] },
    S57:
      missing === "s57"
        ? null
        : { Name: contradictory && name === names[1] ? "Different legacy" : names[1] },
    Package: { Status: 99 },
  });
  const fetchProduct = async (name) => {
    detailCalls.push(name);
    return { success: true, data: normalizeElectronicProductResponse(payload(name)) };
  };
  const get = async (path) => {
    getCalls.push(path);
    if (path.endsWith("/artifacts/history")) return { Data: [] };
    return { Data: payload(decodeURIComponent(path.split("/").at(-1))) };
  };
  const workspaceWorkUnitService = createWorkspaceWorkUnitService({
    registry,
    productService,
    fetchProduct,
  });
  return {
    registry,
    productService,
    workspaceWorkUnitService,
    get,
    exactCalls,
    detailCalls,
    getCalls,
  };
}

for (const input of [[names[0]], [names[1]], names, [...names].reverse()]) {
  test(`canonical package composition for ${JSON.stringify(input)}`, async () => {
    const h = harness();
    const products = await fetchAnalyzeProducts(input, h);
    assert.equal(products.length, 1);
    const [product] = products;
    assert.equal(product.workspaceLoadState, "loaded", product.loadError);
    assert.equal(product.datasetName, names[0]);
    assert.deepEqual(
      product.members.map((member) => member.datasetName),
      names
    );
    assert.deepEqual(
      product.members.map((member) => member.memberLabel),
      ["S-101", "S-57"]
    );
    assert.deepEqual(
      product.members.map((member) => member.status),
      [8, 11]
    );
    assert.deepEqual(
      product.members.map((member) => member.edition),
      [3, 7]
    );
    assert.deepEqual(
      product.members.map((member) => member.update),
      [2, 4]
    );
    assert.ok(
      product.members.every(
        (member) => member.xml === null && member.internalValidationReports.length === 0
      )
    );
    const items = canonicalizeAnalyzeItems(createAnalyzeDatasetItems(input), products);
    assert.deepEqual(getEnabledAnalyzeDatasetNames(items), [names[0]]);
    const options = { origin: "https://catalogue.example", baseUrl: "/" };
    const route = parseWorkspaceRoute(
      buildWorkspaceUrl("analyze", getEnabledAnalyzeDatasetNames(items), options),
      options
    );
    assert.deepEqual(route.datasetNames, [names[0]]);
    assert.deepEqual(h.exactCalls, input[0] === names[0] ? names : [...names].reverse());
    assert.equal(h.detailCalls.filter((name) => name === names[0]).length, 1);
    assert.equal(h.getCalls.filter((path) => path.endsWith("/artifacts/history")).length, 2);
    assert.equal(
      h.getCalls.filter((path) => path === `electronicproducts/${encodeURIComponent(names[0])}`)
        .length,
      0
    );
  });
}

test("one package supplies one shared map entry with one outer enable/remove owner", async () => {
  const h = harness();
  const products = await fetchAnalyzeProducts(names, h);
  const entries = products.map(createCompatibilityAnalyzeEntry).filter(Boolean);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].feature.geometry, geometry);
  assert.equal(entries[0].productContext.datasetName, names[0]);
  assert.equal(products.map(createSourceAnalyzeEntry).filter(Boolean).length, 0);
  const items = canonicalizeAnalyzeItems(createAnalyzeDatasetItems(names), products);
  const disabled = toggleAnalyzeDatasetItem(items, items[0].id, false);
  assert.deepEqual(getEnabledAnalyzeDatasetNames(disabled), []);
  assert.deepEqual(removeAnalyzeDatasetItem(items, items[0].id), []);
  assert.equal(products[0].members.length, 2);
});

for (const options of [
  { missing: "s101" },
  { missing: "s57" },
  { failExact: names[1] },
  { missingGeometry: true },
  { contradictory: true },
]) {
  test(`package failure never publishes an independent member: ${JSON.stringify(options)}`, async () => {
    const [product] = await fetchAnalyzeProducts([names[0]], harness(options));
    assert.equal(product.workspaceLoadState, "failed");
    assert.equal(product.members, undefined);
    assert.equal(createCompatibilityAnalyzeEntry(product, 0), null);
    assert.equal(createSourceAnalyzeEntry(product, 0), null);
  });
}

test("canonicalization keeps first logical occurrence, simple identities, and shared enabled intent", async () => {
  const [packageProduct] = await fetchAnalyzeProducts(names, harness());
  const items = canonicalizeAnalyzeItems(
    [
      { name: "Unrelated alpha", enabled: true },
      { name: names[1], enabled: false },
      { name: "Unrelated beta", enabled: true },
      { name: names[0], enabled: true },
    ],
    [packageProduct]
  );
  assert.deepEqual(
    items.map((item) => item.name),
    ["Unrelated alpha", names[0], "Unrelated beta"]
  );
  assert.equal(items[1].enabled, true);
});

test("failed refresh retains both accepted members atomically while unrelated successful units update", async () => {
  const [accepted] = await fetchAnalyzeProducts(names, harness());
  const [failed] = await fetchAnalyzeProducts([names[0]], harness({ missing: "s57" }));
  const simple = { datasetName: "Independent", workspaceLoadState: "loaded", edition: 1 };
  const next = mergeAnalyzeRefresh(
    [accepted, simple],
    [failed, { ...simple, edition: 2 }],
    [names[0], simple.datasetName]
  );
  assert.equal(next[0].members, accepted.members);
  assert.equal(next[0].aoiGeometry, accepted.aoiGeometry);
  assert.ok(next[0].loadError);
  assert.equal(next[1].edition, 2);
  assert.equal(retainAcceptedAnalyzePackages([failed], [accepted])[0].members, accepted.members);
});

test("nested history uses each exact member context without introducing top-level children", async () => {
  const [product] = await fetchAnalyzeProducts(names, harness());
  const calls = [];
  const [result] = await loadAnalyzeProductHistories([product], {
    fetchHistory: async (name, options) => {
      calls.push([name, options.productContext.sourceId]);
      return { endpointAvailable: true, events: [] };
    },
  });
  assert.deepEqual(calls, [
    [names[0], "s101"],
    [names[1], "s57"],
  ]);
  assert.equal(result.datasetName, names[0]);
  assert.equal(result.members.length, 2);
});

test("composition result is reused for projection rather than resolving a package twice", async () => {
  const h = harness();
  const resolutions = await resolveAnalyzeWorkUnits(names, h);
  const calls = h.exactCalls.length;
  const products = await fetchAnalyzeProducts(names, { ...h, resolutions });
  assert.equal(products.length, 1);
  assert.equal(h.exactCalls.length, calls);
});

test("post-prime projection rereads member metadata and rejects a remapped snapshot", async () => {
  const h = harness();
  const resolutions = await resolveAnalyzeWorkUnits(names, h);
  const products = await fetchAnalyzeProducts(names, { ...h, resolutions, reuseDetails: false });
  assert.equal(products[0].workspaceLoadState, "loaded");
  assert.equal(h.getCalls.filter((path) => !path.endsWith("/artifacts/history")).length, 2);
  const [failed] = await fetchAnalyzeProducts(names, {
    ...h,
    resolutions,
    reuseDetails: false,
    get: async (path) =>
      path.endsWith("/artifacts/history")
        ? { Data: [] }
        : {
            Data: {
              Name: decodeURIComponent(path.split("/").at(-1)),
              S101: { Name: names[0] },
              S57: { Name: "Remapped" },
            },
          },
  });
  assert.equal(failed.workspaceLoadState, "failed");
  assert.equal(failed.members, undefined);
});
