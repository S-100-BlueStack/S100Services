import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { createAoiFeatureServiceConfig } from "../../aoi/config/aoiConfig.js";
import { createAoiOutFields, createAoiPopupTemplate } from "../../aoi/config/aoiFieldConfig.js";

export function createAoiLayer({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  if (!config.isConfigured) {
    return null;
  }

  return new FeatureLayer({
    id: "job-manager-aoi-layer",
    title: "Areas of Interest",
    url: config.url,
    outFields: createAoiOutFields(),
    popupEnabled: true,
    popupTemplate: createAoiPopupTemplate(),
  });
}
