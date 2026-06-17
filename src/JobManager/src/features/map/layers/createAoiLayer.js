import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { createAoiFeatureServiceConfig } from "../../aoi/config/aoiConfig.js";

export function createAoiLayer({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  if (!config.isConfigured) {
    return null;
  }

  return new FeatureLayer({
    id: "job-manager-aoi-layer",
    title: "Areas of Interest",
    url: config.url,
    outFields: ["*"],
    popupEnabled: true,
    popupTemplate: {
      title: "Area of Interest",
      content: "AOI popup content will be configured after the source fields are confirmed.",
    },
  });
}
