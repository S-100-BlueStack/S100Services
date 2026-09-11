import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceUrl, parseWorkspaceRoute } from "./workspaceRoute.js";
import { createWorkspaceProductService } from "../../features/products/services/workspaceProductService.js";
import { createDataSourceRegistry } from "../../features/dataSources/config/dataSourceRegistry.js";
import { validateProductCatalogSelection } from "../../features/products/domain/productCatalog.js";
import { fetchAnalyzeProducts } from "../../features/analyze/api/analyzeApi.js";
import { loadReviewHistories } from "../../features/review/services/reviewHistoryLoader.js";

function createService() {
  return createWorkspaceProductService({
    registry: createDataSourceRegistry({ isDevelopment: true }),
    loadCompatibilityCatalog: async () => ({ Data: ["A&B"] }),
    loadSource: async (source) => [{ datasetName: `${source.id}-product` }],
    normalizeSource: (entries, source) => ({
      products: entries.map((entry) => ({
        ...entry,
        productKey: entry.datasetName,
        sourceId: source.id,
      })),
      layers: [],
    }),
  });
}

for (const routeName of ["analyze", "review"]) {
  test(`${routeName} route resolves source identity and isolates an invalid entry`, async () => {
    const service = createService();
    const catalog = await service.loadCatalog();
    const sourceProduct = catalog.find((item) => item.sourceId !== "compatibility-aoi");
    assert.ok(sourceProduct);
    const names = [sourceProduct.datasetName, "MISSING", "A&B"];
    const options = { origin: "https://catalogue.example", baseUrl: "/" };
    const route = parseWorkspaceRoute(buildWorkspaceUrl(routeName, names, options), options);
    const validation = validateProductCatalogSelection(catalog, route.datasetNames);
    assert.deepEqual(validation.valid, [sourceProduct.datasetName, "A&B"]);
    assert.deepEqual(validation.unknown, ["MISSING"]);
    const calls = [];
    if (routeName === "analyze") {
      const results = await fetchAnalyzeProducts(route.datasetNames, {
        workspaceProductService: service,
        get: async (endpoint) => {
          calls.push(endpoint);
          return { Data: { DatasetName: "A&B", Geometry: { rings: [] } } };
        },
      });
      assert.deepEqual(
        results.map((item) => item.workspaceLoadState),
        ["loaded", "failed", "loaded"]
      );
      assert.equal(results[0].productContext.sourceId, sourceProduct.sourceId);
      assert.equal(results[1].productContext, null);
      assert.equal(results[1].isMock, false);
      assert.deepEqual(calls, ["electronicproducts/A%26B/aoi"]);
    } else {
      const results = await loadReviewHistories(route.datasetNames, {
        workspaceProductService: service,
        fetchHistory: async (name, { productContext }) => {
          calls.push([name, productContext.sourceId]);
          return { endpointAvailable: productContext.sourceId === "compatibility-aoi", events: [] };
        },
      });
      assert.deepEqual(
        results.map((item) => item.loadState),
        ["unavailable", "failed", "loaded"]
      );
      assert.equal(results[0].productContext.sourceId, sourceProduct.sourceId);
      assert.equal(results[1].productContext, null);
      assert.deepEqual(calls, [
        [sourceProduct.datasetName, sourceProduct.sourceId],
        ["A&B", "compatibility-aoi"],
      ]);
    }
  });
}
