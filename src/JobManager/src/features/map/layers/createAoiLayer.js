import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { createAoiFeatureServiceConfig } from "../../aoi/config/aoiConfig.js";
import { createAoiOutFields, createAoiPopupTemplate } from "../../aoi/config/aoiFieldConfig.js";
import { createAoiPopupActions } from "../popups/aoiPopupActions.js";
import { createDefaultAoiRenderer } from "./aoiRenderer.js";

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
    popupTemplate: createAoiLayerPopupTemplate(),
    renderer: createDefaultAoiRenderer(),
  });
}

export function refreshAoiLayerPopupTemplate({ aoiLayer, availableFieldNames } = {}) {
  if (!aoiLayer) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-layer-missing",
    };
  }

  aoiLayer.popupTemplate = createAoiLayerPopupTemplate({
    availableFieldNames,
  });

  return {
    ok: true,
    applied: true,
  };
}

function createAoiLayerPopupTemplate({ availableFieldNames } = {}) {
  return {
    ...createAoiPopupTemplate({
      availableFieldNames,
    }),
    actions: createAoiPopupActions(),
  };
}
