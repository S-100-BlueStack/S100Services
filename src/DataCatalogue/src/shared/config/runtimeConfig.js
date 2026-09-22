export function getRuntimeConfig() {
  return {
    arcgisPortalUrl: readStringEnv("VITE_ARCGIS_PORTAL_URL"),
    aoiFeatureServiceUrl: readStringEnv("VITE_AOI_FEATURE_SERVICE_URL"),
  };
}

export function hasAoiFeatureServiceConfig(config = getRuntimeConfig()) {
  return Boolean(config.aoiFeatureServiceUrl);
}

function readStringEnv(key) {
  const value = import.meta.env[key];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
