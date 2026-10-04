import esriConfig from "@arcgis/core/config.js";
import { resolveArcGISPortalUrl } from "./arcgisPortalConfig.js";

export function configureArcGIS({ env = import.meta.env } = {}) {
  const portalUrl = resolveArcGISPortalUrl(env?.VITE_ARCGIS_PORTAL_URL);
  esriConfig.portalUrl = portalUrl;
  return portalUrl;
}
