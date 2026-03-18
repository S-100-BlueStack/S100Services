import Graphic from "@arcgis/core/Graphic.js";
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

export function geoJsonToGraphics(geojson) {
  return geojson.features.map((feature) => {
    const status = feature.properties.status;
    return new Graphic({
      geometry: convertGeometry(feature.geometry),
      attributes: {
        ...feature.properties,
        id: feature.properties.id,
        status,
      },
      symbol: getSymbol(status),
    });
  });
}

function convertGeometry(geometry) {
  if (!geometry) return null;

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

    case "MultiPolygon": {
      // Flatten alle polygons → ét rings array
      const rings = geometry.coordinates.flat();

      return {
        type: "polygon",
        rings,
        spatialReference: { wkid: 4326 },
      };
    }

    default:
      console.warn("Unsupported geometry type:", geometry.type);
      return null;
  }
}
