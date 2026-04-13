import Graphic from "@arcgis/core/Graphic.js";
import * as jsonUtils from "@arcgis/core/geometry/support/jsonUtils.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig";
import { resolveFeatureKey } from "../core/featureIdentity.js";

function getSymbol(status) {
  const cfg = statusColorConfig[status];

  if (!cfg) {
    return {
      type: "simple-fill",
      color: [0, 0, 0, 0.5],
      outline: { color: [0, 0, 0], width: 1 },
    };
  }

  return {
    type: "simple-fill",
    color: cfg.fill,
    outline: {
      color: cfg.outline,
      width: 1,
    },
  };
}

export function esriJsonToGraphics(input, { layerId } = {}) {
  const features = normalizeEsriFeatures(input);

  return features.map((feature) => {
    const attributes = feature.attributes ?? {};
    const status = attributes.status;
    const geometry = feature.geometry ? jsonUtils.fromJSON(feature.geometry) : null;
    const featureKey = resolveFeatureKey(attributes, layerId);

    return new Graphic({
      geometry,
      attributes: {
        ...attributes,
        featureKey,
        status,
      },
      symbol: getSymbol(status),
    });
  });
}

function normalizeEsriFeatures(input) {
  let features = [];

  if (Array.isArray(input)) {
    features = input;
  } else if (Array.isArray(input?.features)) {
    features = input.features;
  }

  return features.filter(
    (feature) => feature && typeof feature === "object" && (feature.geometry || feature.attributes)
  );
}
