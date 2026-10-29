import { resolveSourceMode } from "./sourceMode.js";

export function getRuntimeConfig() {
  return {
    sourceMode: resolveSourceMode(readStringEnv("VITE_CATALOGUE_SOURCE") || "mock"),
    catalogueApiBaseUrl: readStringEnv("VITE_CATALOGUE_API_BASE_URL"),
    catalogueApiCredentials: readStringEnv("VITE_CATALOGUE_API_CREDENTIALS") || "same-origin",
    workStreamMapServiceUrl: readStringEnv("VITE_WORK_STREAM_MAP_SERVICE_URL"),
    arcgisPortalUrl: readStringEnv("VITE_ARCGIS_PORTAL_URL"),
    aoiFeatureServiceUrl: readStringEnv("VITE_AOI_FEATURE_SERVICE_URL"),
  };
}

export function hasAoiFeatureServiceConfig(config = getRuntimeConfig()) {
  return Boolean(config.aoiFeatureServiceUrl);
}

function readStringEnv(key) {
  const value = import.meta.env?.[key];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
