import { createSuccessResult } from "../../../shared/api/apiResult.js";
import { createAoiFeatureServiceConfig } from "../config/aoiConfig.js";

export async function loadAois({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  // Return a stable shape now so UI and map code can integrate before the real AOI query path is confirmed.
  return createSuccessResult(
    {
      aois: [],
      sourceType: config.sourceType,
      isConfigured: config.isConfigured,
    },
    {
      source: "aoi-service-skeleton",
      configured: config.isConfigured,
    }
  );
}
