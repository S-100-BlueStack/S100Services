import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";

export function createPackageHarness(prefix = "Harbour") {
  const registry = createDataSourceRegistry();
  const names = { s101: `${prefix} boundary`, s57: `${prefix} legacy chart` };
  const metadata = { ...names };
  const fetchProduct = async (name) => ({
    success: true,
    data: normalizeElectronicProductResponse({
      Name: name,
      S101: { Name: metadata.s101 },
      S57: { Name: metadata.s57 },
    }),
  });
  const productService = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (name) => {
      const sourceId = Object.keys(names).find((key) => names[key] === name);
      if (!sourceId) return { success: false, status: 404 };
      return {
        success: true,
        data: {
          Data: {
            Geometry: { x: 10, y: 56 },
            Attributes: {
              DatasetName: name,
              ProductSpecification: registry.byId.get(sourceId).normalizer.specification,
            },
          },
        },
      };
    },
  });
  const workUnitService = createWorkspaceWorkUnitService({
    registry,
    productService,
    fetchProduct,
  });
  return { registry, names, metadata, fetchProduct, productService, workUnitService };
}

export function emptyHistory(datasetName, overrides = {}) {
  return { datasetName, endpointAvailable: true, events: [], warnings: [], ...overrides };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
