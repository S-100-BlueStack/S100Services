import { loadStatuses } from "../stores/statusStore.js";
import { loadUsages } from "../stores/usageStore.js";
import { layerConfigs } from "../../map/config/layerConfigs.js";
import { apiRequest } from "../../../shared/api/apiClient.js";

export async function loadAppData() {
  await Promise.all([loadStatuses(), loadUsages()]);

  const layers = await Promise.all(
    layerConfigs.map(async (config) => {
      const data = await config.fetch();

      return {
        id: config.id,
        type: config.type,
        dataFormat: config.dataFormat,
        data,
      };
    })
  );

  return { layers };
}

export async function fetchGeoJson() {
  const result = await apiRequest("mock/products");

  if (!result.success) {
    if (result.isUnauthorized) {
      throw new Error("Unauthorized while loading GeoJSON");
    }

    if (result.isForbidden) {
      throw new Error("Forbidden while loading GeoJSON");
    }

    if (result.networkError) {
      throw new Error(`Network error while loading GeoJSON: ${result.errorMessage}`);
    }

    throw new Error(`GeoJSON request failed: ${result.status ?? "unknown"}`);
  }

  return result.data;
}

export async function fetchAOI() {
  const result = await apiRequest("electronicproducts/aoi");

  if (!result.success) {
    if (result.isUnauthorized) {
      throw new Error("Unauthorized while loading AOI");
    }

    if (result.isForbidden) {
      throw new Error("Forbidden while loading AOI");
    }

    if (result.networkError) {
      throw new Error(`Network error while loading AOI: ${result.errorMessage}`);
    }

    throw new Error(`AOI request failed: ${result.status ?? "unknown"}`);
  }

  return result.data;
}
