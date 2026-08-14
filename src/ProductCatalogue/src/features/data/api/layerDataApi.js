import { apiGet } from "../../../shared/api/apiClient.js";

export async function fetchGeoJson() {
  return await apiGet("mock/products", "GeoJSON request failed");
}

export async function fetchAOI(productSpecification = "S101") {
  const specification = encodeURIComponent(productSpecification);
  return await apiGet(`electronicproducts/aoi?productSpecification=${specification}`, "AOI request failed");
}
