import { loadStatuses } from "../stores/statusStore.js";
import { loadUsages } from "../stores/usageStore.js";
import { layerConfigs } from "../../map/config/layerConfigs.js";

const API_BASE_URL = "https://localhost:7271/";

export async function loadAppData() {
  await Promise.all([loadStatuses(), loadUsages()]);

  const layers = await Promise.all(
    layerConfigs.map(async (config) => {
      const data = await config.fetch();

      return {
        id: config.id,
        type: config.type,
        data,
      };
    })
  );

  return { layers };
}

export async function fetchGeoJson() {
  const response = await fetch(`${API_BASE_URL}mock/products`);

  if (!response.ok) {
    throw new Error(`GeoJSON request failed: ${response.status}`);
  }

  return await response.json();
}
