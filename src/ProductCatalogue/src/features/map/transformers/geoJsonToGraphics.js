import Graphic from "@arcgis/core/Graphic.js";
import { resolveFeatureKey } from "../core/featureIdentity.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";
import { resolveDisplayScaleValue } from "../scale/displayScale.js";

export function geoJsonToGraphics(
  geojson,
  { layerId, layerKind, displayScale: layerDisplayScale } = {}
) {
  return geojson.features
    .map((feature) => {
      const attributes = feature.properties ?? {};
      const status = attributes.status;
      const featureKey = resolveFeatureKey(attributes, layerId);
      const displayScale = resolveDisplayScaleValue(attributes, feature, {
        displayScale: layerDisplayScale,
      });
      const geometry = convertGeometry(feature.geometry);

      if (!geometry) {
        return null;
      }

      return new Graphic({
        geometry,
        attributes: {
          ...attributes,
          layerId,
          layerKind,
          featureKey,
          displayScale,
          status,
        },
        symbol: getCorrectionSymbol(status),
      });
    })
    .filter(Boolean);
}

function convertGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  switch (geometry.type) {
    case "Point":
      return {
        type: "point",
        x: geometry.coordinates[0],
        y: geometry.coordinates[1],
        spatialReference: { wkid: 4326 },
      };

    case "LineString":
      return {
        type: "polyline",
        paths: [geometry.coordinates],
        spatialReference: { wkid: 4326 },
      };

    case "Polygon":
      return {
        type: "polygon",
        rings: geometry.coordinates,
        spatialReference: { wkid: 4326 },
      };

    case "MultiPolygon":
      return {
        type: "polygon",
        rings: geometry.coordinates.flat(),
        spatialReference: { wkid: 4326 },
      };

    default:
      console.warn("Unsupported geometry type:", geometry.type);
      return null;
  }
}
