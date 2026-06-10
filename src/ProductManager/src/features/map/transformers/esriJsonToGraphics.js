import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import Point from "@arcgis/core/geometry/Point.js";
import { resolveFeatureKey } from "../core/featureIdentity.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";
import { resolveDisplayScaleValue } from "../scale/displayScale.js";

export function esriJsonToGraphics(
  data,
  { layerId, layerKind, displayScale: layerDisplayScale } = {}
) {
  const features = getFeatures(data);

  return features
    .map((feature, index) => {
      const rawAttributes = getFeatureAttributes(feature);
      const attributes = normalizeFeatureAttributes(rawAttributes);
      const rawGeometry = getFeatureGeometry(feature);

      const status = attributes.status;
      const geometry = createGeometry(rawGeometry);
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
          geometryValue: rawGeometry,
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

          // Other map systems rely on these stable keys for indexing, hover
          // state, popup actions, filtering and future refresh reconciliation.
          layerId,
          layerKind,
          featureKey,

          // Keep displayScale normalized so map visibility logic does not need
          // to understand every possible API field shape.
          displayScale,
          status,
        },
        symbol: getCorrectionSymbol(status),
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

  if (Array.isArray(data?.Features)) {
    return data.Features;
  }

  return [];
}

function getFeatureAttributes(feature) {
  return (
    feature?.attributes ?? feature?.Attributes ?? feature?.properties ?? feature?.Properties ?? {}
  );
}

function getFeatureGeometry(feature) {
  return feature?.geometry ?? feature?.Geometry ?? null;
}

function normalizeFeatureAttributes(attributes) {
  return {
    ...attributes,

    // Backend AOI records currently use PascalCase attributes. The rest of the
    // frontend relies on stable lowercase keys for identity, popup rendering,
    // filtering, action availability and display-scale hiding.
    datasetName: readFirstDefined(attributes, ["datasetName", "DatasetName", "name", "Name"]),
    displayScale: readFirstDefined(attributes, ["displayScale", "DisplayScale"]),
    usageBand: readFirstDefined(attributes, ["usageBand", "UsageBand"]),
    status: readFirstDefined(attributes, ["status", "Status", "productState", "ProductState"]),
  };
}

function readFirstDefined(source, keys) {
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
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
