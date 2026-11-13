import { apiGet } from "../../../shared/api/apiClient.js";
import { normalizeArtifactHistory } from "../normalizers/productArtifact.js";

export async function fetchProductArtifacts(datasetName, { productContext, get = apiGet } = {}) {
  const content = productContext?.contentConfiguration;
  if (
    content?.internalValidation?.loaderId !== "electronic-artifacts" &&
    content?.icEncReports?.loaderId !== "electronic-artifacts"
  ) {
    return [];
  }
  if (String(datasetName).toLowerCase() !== productContext.datasetName.toLowerCase()) {
    throw new Error("Product artifact identity mismatch.");
  }
  return normalizeArtifactHistory(
    await get(
      `electronicproducts/${encodeURIComponent(datasetName)}/artifacts/history`,
      `Validation artifact history could not be loaded for ${datasetName}`
    )
  );
}
