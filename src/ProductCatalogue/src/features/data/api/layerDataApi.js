import { apiGet } from "../../../shared/api/apiClient.js";

export async function fetchGeoJson() {
  return await apiGet("mock/products", "GeoJSON request failed");
}

export async function fetchAOI() {
  return await apiGet("electronicproducts/aoi", "AOI request failed");
}
