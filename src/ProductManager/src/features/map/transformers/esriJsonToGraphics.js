import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import Point from "@arcgis/core/geometry/Point.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig";
import { resolveFeatureKey } from "../core/featureIdentity.js";

export function esriJsonToGraphics(input, { layerId } = {}) {
  const features = normalizeEsriFeatures(input);

  return features
    .map((feature, index) => {
      const attributes = feature.attributes ?? feature.properties ?? {};
      const status = attributes.status;
      const geometry = createGeometry(feature.geometry);
      const featureKey = resolveFeatureKey(attributes, layerId);

      if (!geometry) {
        console.warn("[Map debug] Esri feature has no valid geometry.", {
          index,
          layerId,
          featureKey,
          rawGeometry: feature.geometry,
          feature,
        });

        return null;
      }

      if (!featureKey) {
        console.warn("[Map debug] Esri feature has no featureKey source.", {
          index,
          layerId,
          attributes,
        });
      }

      return new Graphic({
        geometry,

        attributes: {
          ...attributes,

          // Other map systems rely on this stable key for indexing, hover state,
          // popup actions, and future refresh reconciliation.
          featureKey,

          // Keep status explicit even if future API responses move or rename fields.
          status,
        },

        symbol: getSymbol(status),
      });
    })
    .filter(Boolean);
}

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

function normalizeEsriFeatures(input) {
  let features = [];

  if (Array.isArray(input)) {
    features = input;
  } else if (Array.isArray(input?.features)) {
    features = input.features;
  }

  return features.filter(
    (feature) =>
      feature &&
      typeof feature === "object" &&
      (feature.geometry || feature.attributes || feature.properties)
  );
}

function createGeometry(rawGeometry) {
  const geometryJson = parseGeometryJson(rawGeometry);

  if (!geometryJson) {
    return null;
  }

  if (Array.isArray(geometryJson.rings)) {
    return Polygon.fromJSON(geometryJson);
  }

  if (Array.isArray(geometryJson.paths)) {
    return Polyline.fromJSON(geometryJson);
  }

  if (typeof geometryJson.x === "number" && typeof geometryJson.y === "number") {
    return Point.fromJSON(geometryJson);
  }

  console.warn("[Map debug] Unsupported Esri geometry JSON.", geometryJson);
  return null;
}

function parseGeometryJson(rawGeometry) {
  if (!rawGeometry) {
    return null;
  }

  if (typeof rawGeometry === "string") {
    try {
      return JSON.parse(rawGeometry);
    } catch (error) {
      console.warn("[Map debug] Failed to parse Esri geometry JSON string.", {
        rawGeometry,
        error,
      });

      return null;
    }
  }

  if (typeof rawGeometry === "object") {
    return rawGeometry;
  }

  console.warn("[Map debug] Unsupported Esri geometry value.", {
    rawGeometry,
    type: typeof rawGeometry,
  });

  return null;
}
