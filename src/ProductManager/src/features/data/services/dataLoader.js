import { loadStatuses } from "../stores/statusStore.js";
import { loadUsages } from "../stores/usageStore.js";
import { layerConfigs } from "../../map/config/layerConfigs.js";
import { apiGet } from "../../../shared/api/apiClient.js";

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
  return await apiGet("mock/products", "GeoJSON request failed");
}

export async function fetchAOI() {
  return await apiGet("electronicproducts/aoi", "AOI request failed");
}
