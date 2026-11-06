import esriConfig from "@arcgis/core/config.js";
import { DEFAULT_BASEMAP } from "../basemaps/basemapSettings.js";
import { createDefaultMapViewOptions, DEFAULT_ZOOM } from "./mapViewDefaults.js";
export { DEFAULT_BASEMAP, DEFAULT_ZOOM };

export function configureArcGisRuntime(runtimeConfig = {}) {
  const portalUrl = normalizeOptionalString(
    runtimeConfig.portalUrl ?? runtimeConfig.arcgisPortalUrl
  );

  if (portalUrl) {
    esriConfig.portalUrl = portalUrl;
  }
  // Only authorize Esri basemap-style requests. Do not attach a public browser
  // API key to private ArcGIS or catalogue API requests.
  if (runtimeConfig.arcgisBasemapApiKey) {
    esriConfig.apiKeys.basemapStyles = runtimeConfig.arcgisBasemapApiKey;
  }
}

export function createDefaultMapConfig() {
  return {
    basemap: DEFAULT_BASEMAP,
    ...createDefaultMapViewOptions(),
  };
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
