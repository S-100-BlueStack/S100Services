import { apiRequest } from "../../../shared/api/apiClient.js";
import { getApiResultErrorMessage } from "../../../shared/api/apiResult.js";

export function createTargetedProductStatusLoader({ request = apiRequest } = {}) {
  return async function loadTargetedProductStatus(source, datasetName, { signal } = {}) {
    if (source?.targetedStatus?.type !== "electronic-package-status") {
      throw new Error("The source does not have a targeted status endpoint.");
    }
    const result = await request(
      `${source.targetedStatus.path}/${encodeURIComponent(datasetName)}/status`,
      { method: "GET", signal, cache: "no-store", timeoutMs: 15000 }
    );
    if (!result?.success) {
      throw new Error(
        getApiResultErrorMessage(result, "Targeted Product status could not be read.")
      );
    }
    // apiRequest returns the HTTP JSON body; this endpoint wraps its attributes
    // in ApiResponse<Attributes>. The full AOI endpoint does not use this envelope.
    const envelope = result.data;
    const success = envelope?.success ?? envelope?.Success;
    const attributes = envelope?.data ?? envelope?.Data;
    if (
      success !== true ||
      !attributes ||
      typeof attributes !== "object" ||
      Array.isArray(attributes)
    ) {
      throw new Error("Targeted Product status returned an invalid API response.");
    }
    return attributes;
  };
}
