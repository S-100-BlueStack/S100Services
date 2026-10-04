import { apiRequest } from "../../../shared/api/apiClient.js";

const CAPABILITY_TIMEOUT_MS = 15 * 1000;

export async function fetchProductCatalogueCapabilities() {
  return apiRequest("lookup/capabilities", {
    method: "GET",
    timeoutMs: CAPABILITY_TIMEOUT_MS,
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
}
