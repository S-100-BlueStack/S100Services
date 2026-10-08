import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { createWorkspaceProductContext } from "../../products/domain/productContext.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import { fetchProductArtifacts } from "../../data/api/productArtifactApi.js";

export const packageNames = ["Harbour boundary & east", "Legacy chart north"];
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export function createReviewPackageFixture() {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const calls = { exact: [], detail: [], history: [], artifacts: [] };
  const controls = { missing: null, failExact: null, failHistory: null, failArtifacts: null,
    detailGate: null, historyGate: null, artifactGate: null, edition: 3, remapped: false };
  const electronic = createWorkspaceProductService({ registry,
    loadTargetedProduct: async (name) => {
      calls.exact.push(name);
      const index = packageNames.indexOf(name);
      if (index < 0 || controls.failExact === name) return { success: false, status: 404 };
      return { success: true, data: { Data: { Geometry: { x: 10, y: 56 }, Attributes: {
        DatasetName: name, ProductSpecification: index ? "S57" : "S101",
        Status: index ? 11 : 8, Edition: index ? 7 : controls.edition, Update: index ? 4 : 2,
      } } } };
    },
  });
  const source = registry.byId.get("paper-charts");
  const simple = (name) => createWorkspaceProductContext({
    sourceId: source.id, sourceLabel: source.label, productKey: name, datasetName: name,
    productType: source.productType, capabilities: source.capabilities,
    contentConfiguration: source.contentConfiguration, data: { attributes: {} },
  });
  const productService = { resolveProduct: async (name) => {
    if (["Simple A", "Simple B", "Simple C"].includes(name)) {
      calls.exact.push(name);
      return { status: "resolved", datasetName: name, product: simple(name) };
    }
    return electronic.resolveProduct(name);
  } };
  const fetchProduct = async (name) => {
    calls.detail.push(name);
    if (controls.detailGate) await controls.detailGate.promise;
    if (controls.missing === name) return { success: false, errorMessage: "Metadata offline" };
    const index = packageNames.indexOf(name);
    return { success: true, data: normalizeElectronicProductResponse({ Name: name,
      Status: index ? 11 : 8, Edition: index ? 7 : controls.edition, Update: index ? 4 : 2,
      S101: { Name: packageNames[0] }, S57: { Name: controls.remapped ? "Remapped chart" : packageNames[1] },
    }) };
  };
  const records = [
    { Id: "11111111-1111-1111-1111-111111111111", DatasetName: packageNames[0], ProductSpecification: "S101", TrackId: "primary", RevisionId: "current" },
    { Id: "22222222-2222-2222-2222-222222222222", DatasetName: packageNames[1], ProductSpecification: "S57", TrackId: "secondary", RevisionId: "current" },
    { Id: "33333333-3333-3333-3333-333333333333", DatasetName: packageNames[0], ProductSpecification: "S101", TrackId: "primary", RevisionId: "historical" },
    { Id: "44444444-4444-4444-4444-444444444444", DatasetName: null, ProductSpecification: "Unknown" },
  ].map((record) => ({ ...record, FileName: `${record.Id}.txt`, MediaType: "text/plain",
    Url: `electronicproducts/${encodeURIComponent(record.DatasetName ?? "Unknown")}/artifacts/${record.Id}` }));
  const options = {
    workspaceProductService: productService,
    workspaceWorkUnitService: createWorkspaceWorkUnitService({ registry, productService, fetchProduct }),
    fetchProduct,
    fetchHistory: (name, context) => fetchProductHistory(name, { ...context, get: async () => {
      calls.history.push(name);
      if (controls.historyGate) await controls.historyGate.promise;
      if (controls.failHistory === name) throw new Error("History offline");
      return { Data: [] };
    } }),
    fetchArtifacts: (name, context) => fetchProductArtifacts(name, { ...context, get: async () => {
      calls.artifacts.push(name);
      if (controls.artifactGate) await controls.artifactGate.promise;
      if (controls.failArtifacts === name) throw new Error("Artifacts offline");
      return { Data: records };
    } }),
  };
  return { registry, calls, controls, options, records };
}

export async function waitForReview(predicate) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Review test did not reach its expected deferred boundary.");
}
