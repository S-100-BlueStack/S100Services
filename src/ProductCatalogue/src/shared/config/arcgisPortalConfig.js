export const DEFAULT_ARCGIS_PORTAL_URL = "https://www.arcgis.com";

export function resolveArcGISPortalUrl(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || !/^https?:\/\//i.test(candidate)) {
    return DEFAULT_ARCGIS_PORTAL_URL;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_ARCGIS_PORTAL_URL;
    }
    if (!url.hostname || url.username || url.password) {
      return DEFAULT_ARCGIS_PORTAL_URL;
    }

    return candidate;
  } catch {
    return DEFAULT_ARCGIS_PORTAL_URL;
  }
}
