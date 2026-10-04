import { apiGet } from "../../../shared/api/apiClient.js";
import { normalizeProductCatalog } from "../domain/productCatalog.js";

const PRODUCT_CATALOG_ENDPOINT = "electronicproducts";

export async function fetchProductCatalog({ get = apiGet } = {}) {
  const payload = await get(PRODUCT_CATALOG_ENDPOINT, "Product catalog request failed");
  return normalizeProductCatalog(payload);
}

export async function fetchCompatibilityProductCatalog(options) {
  return fetchProductCatalog(options);
}
