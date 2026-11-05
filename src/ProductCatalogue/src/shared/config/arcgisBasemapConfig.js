// A Vite browser key is public build configuration, not a backend credential.
// Only basemap-style requests should receive this value.
export function readArcGISBasemapApiKey(env = import.meta.env) {
  const value = env?.VITE_ARCGIS_BASEMAP_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}
