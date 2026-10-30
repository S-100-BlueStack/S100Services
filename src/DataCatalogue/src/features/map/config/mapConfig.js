import esriConfig from "@arcgis/core/config.js";
import { DEFAULT_BASEMAP } from "../basemaps/basemapSettings.js";
export { DEFAULT_BASEMAP };

const DEFAULT_CENTER = Object.freeze([10.4, 56.15]);
const DEFAULT_CONSTRAINTS = Object.freeze({
  minZoom: 4,
  rotationEnabled: false,
});

export const DEFAULT_ZOOM = 6;

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
    center: [...DEFAULT_CENTER],
    zoom: DEFAULT_ZOOM,
    constraints: { ...DEFAULT_CONSTRAINTS },
  };
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
