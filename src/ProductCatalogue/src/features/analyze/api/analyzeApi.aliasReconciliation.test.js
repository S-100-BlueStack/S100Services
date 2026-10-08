import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { fetchAnalyzeProducts, resolveAnalyzeWorkUnits } from "./analyzeApi.js";
import { canonicalizeAnalyzeItems } from "../domain/analyzeWorkUnits.js";
import { createAnalyzeDatasetItems } from "../domain/analyzeDatasetList.js";
import { createCompatibilityAnalyzeEntry } from "../map/analyzeGraphicProductContext.js";

const names = ["Primary boundary & harbour", "Mapped legacy north"];
const failed = (name) => ({
  status: "failed",
  requestedDatasetName: name,
  product: null,
  workUnit: null,
  error: "Transient member failure",
});

function harness(memberNames = names) {
  const registry = createDataSourceRegistry();
  const productService = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (name) => ({
      success: true,
      data: {
        Data: {
          Geometry: { x: 10, y: 56 },
          Attributes: {
            DatasetName: name,
            ProductSpecification: name === memberNames[0] ? "S101" : "S57",
          },
        },
      },
    }),
  });
  const payload = (name) => ({
    Name: name,
    Status: name === memberNames[0] ? 8 : 11,
    S101: { Name: memberNames[0] },
    S57: { Name: memberNames[1] },
  });
  const service = createWorkspaceWorkUnitService({
    registry,
    productService,
    fetchProduct: async (name) => ({
      success: true,
      data: normalizeElectronicProductResponse(payload(name)),
    }),
  });
  const get = async (path) =>
    path.endsWith("/artifacts/history")
      ? { Data: [] }
      : { Data: payload(decodeURIComponent(path.split("/").at(-1))) };
  return { service, get };
}

for (const first of names) {
  test(`later complete package replaces an earlier failed alias: ${first}`, async () => {
    const h = harness();
    const second = names.find((name) => name !== first);
    const input = [first, second];
    const resolutions = await resolveAnalyzeWorkUnits(input, {
      workspaceWorkUnitService: {
        resolveWorkUnit: (name) =>
          name === first ? failed(name) : h.service.resolveWorkUnit(name),
      },
    });
    assert.equal(resolutions.length, 1);
    assert.equal(resolutions[0].product.datasetName, names[0]);
    const products = await fetchAnalyzeProducts(input, { resolutions, get: h.get });
    assert.equal(products.length, 1);
    assert.equal(products[0].workspaceLoadState, "loaded", products[0].loadError);
    assert.deepEqual(
      products[0].members.map((member) => member.datasetName),
      names
    );
    const items = canonicalizeAnalyzeItems(createAnalyzeDatasetItems(input), products);
    assert.deepEqual(
      items.map((item) => item.name),
      [names[0]]
    );
    assert.equal(products.map(createCompatibilityAnalyzeEntry).filter(Boolean).length, 1);
  });
}

test("no successful package proof retains the truthful failed requested work unit", async () => {
  const [resolution] = await resolveAnalyzeWorkUnits([names[1]], {
    workspaceWorkUnitService: { resolveWorkUnit: async (name) => failed(name) },
  });
  assert.equal(resolution.status, "failed");
  assert.equal(resolution.requestedDatasetName, names[1]);
  assert.equal(resolution.workUnit, null);
  const products = await fetchAnalyzeProducts([names[1]], { resolutions: [resolution] });
  assert.equal(products.length, 1);
  assert.equal(products[0].workspaceLoadState, "failed");
  assert.equal(products[0].datasetName, names[1]);
});

test("overlapping successful package claims fail closed instead of publishing overlapping units", async () => {
  const other = "Different canonical boundary";
  const first = harness();
  const second = harness([other, names[1]]);
  const resolutions = await resolveAnalyzeWorkUnits([names[0], other], {
    workspaceWorkUnitService: {
      resolveWorkUnit: (name) =>
        (name === other ? second.service : first.service).resolveWorkUnit(name),
    },
  });
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].status, "failed");
  assert.equal(resolutions[0].product, null);
  assert.equal(resolutions[0].workUnit, null);
  assert.match(resolutions[0].error, /conflict/i);
  const products = await fetchAnalyzeProducts([names[0], other], { resolutions });
  assert.ok(products.every((product) => product.workspaceLoadState === "failed"));
  assert.equal(products.map(createCompatibilityAnalyzeEntry).filter(Boolean).length, 0);
});
