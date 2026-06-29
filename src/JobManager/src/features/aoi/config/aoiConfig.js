export const AOI_SOURCE_TYPE = Object.freeze({
  FEATURE_SERVICE: "arcgisFeatureService",
  NOT_CONFIGURED: "notConfigured",
});

export function createAoiFeatureServiceConfig(runtimeConfig = {}) {
  const url = normalizeOptionalString(runtimeConfig.aoiFeatureServiceUrl);

  return {
    sourceType: url ? AOI_SOURCE_TYPE.FEATURE_SERVICE : AOI_SOURCE_TYPE.NOT_CONFIGURED,
    url,
    isConfigured: Boolean(url),
  };
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
