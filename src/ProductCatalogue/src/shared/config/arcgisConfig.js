import esriConfig from "@arcgis/core/config.js";
import { resolveArcGISPortalUrl } from "./arcgisPortalConfig.js";
import { readArcGISBasemapApiKey } from "./arcgisBasemapConfig.js";

export function configureArcGIS({ env = import.meta.env } = {}) {
  const portalUrl = resolveArcGISPortalUrl(env?.VITE_ARCGIS_PORTAL_URL);
  esriConfig.portalUrl = portalUrl;
  const basemapApiKey = readArcGISBasemapApiKey(env);
  if (basemapApiKey) {
    // Keep the public browser key off private/organizational API requests.
    esriConfig.apiKeys.basemapStyles = basemapApiKey;
  }
  return portalUrl;
}
