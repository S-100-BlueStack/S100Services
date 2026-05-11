import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import Point from "@arcgis/core/geometry/Point.js";
import { resolveFeatureKey } from "../core/featureIdentity.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";
import { resolveDisplayScaleValue } from "../scale/displayScale.js";

export function esriJsonToGraphics(data, { layerId, displayScale: layerDisplayScale } = {}) {
  const features = getFeatures(data);

  return features
    .map((feature, index) => {
      const attributes = feature.attributes ?? feature.properties ?? {};
      const status = attributes.status;
      const geometry = createGeometry(feature.geometry);
      const featureKey = resolveFeatureKey(attributes, layerId);
      const displayScale = resolveDisplayScaleValue(attributes, feature, {
        displayScale: layerDisplayScale,
      });

      if (!geometry) {
        console.warn("[Map debug] Feature has no valid geometry", {
          index,
          layerId,
          featureKey,
          feature,
          geometryValue: feature.geometry,
        });

        return null;
      }

      if (!featureKey) {
        console.warn("[Map debug] Feature has no featureKey source", {
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

          // Keep displayScale normalized so map visibility logic does not need
          // to understand every possible API field shape.
          displayScale,

          status,
        },
        symbol: getCorrectionSymbol(status, { variant: "detail" }),
      });
    })
    .filter(Boolean);
}

function getFeatures(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.features)) {
    return data.features;
  }

  return [];
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

  console.warn("[Map debug] Unsupported Esri geometry JSON", geometryJson);
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
      console.warn("[Map debug] Failed to parse geometry JSON string", {
        rawGeometry,
        error,
      });

      return null;
    }
  }

  if (typeof rawGeometry === "object") {
    return rawGeometry;
  }

  return null;
}
