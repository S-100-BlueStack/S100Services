import Graphic from "@arcgis/core/Graphic.js";
import * as jsonUtils from "@arcgis/core/geometry/support/jsonUtils.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig";

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

export function esriJsonToGraphics(input) {
  const features = normalizeEsriFeatures(input);

  return features.map((feature) => {
    const attributes = feature.attributes ?? {};
    const status = attributes.status;
    const geometry = feature.geometry ? jsonUtils.fromJSON(feature.geometry) : null;

    return new Graphic({
      geometry,
      attributes: {
        ...attributes,
        id: attributes.id,
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
