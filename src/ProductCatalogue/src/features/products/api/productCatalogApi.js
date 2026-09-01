import { apiGet } from "../../../shared/api/apiClient.js";
import { normalizeProductCatalog } from "../domain/productCatalog.js";
import { getDefaultWorkspaceProductService } from "../services/workspaceProductService.js";

const PRODUCT_CATALOG_ENDPOINT = "electronicproducts";

export async function fetchProductCatalog() {
  return getDefaultWorkspaceProductService().loadCatalog();
}

export async function fetchCompatibilityProductCatalog() {
  const payload = await apiGet(PRODUCT_CATALOG_ENDPOINT, "Product catalog request failed");
  return normalizeProductCatalog(payload);
}
