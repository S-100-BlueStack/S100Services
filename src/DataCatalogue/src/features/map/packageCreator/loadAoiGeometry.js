import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { execute as densify } from "@arcgis/core/geometry/operators/densifyOperator.js";
import {
  shapePreservingProjectExecute,
  shapePreservingProjectIsLoaded,
  shapePreservingProjectLoad,
} from "@arcgis/core/geometry/operators/shapePreservingProjectOperator.js";
import { simplifyIsSimple } from "@arcgis/core/geometry/operators/simplifyOperator.js";
import { executeMany as union } from "@arcgis/core/geometry/operators/unionOperator.js";
import { createAoiGeometry } from "./aoiGeometry.js";

export async function loadAoiGeometry({ isWebMercator }) {
  if (isWebMercator && !shapePreservingProjectIsLoaded()) await shapePreservingProjectLoad();
  return createAoiGeometry({
    linearize(polygon) {
      // Sketch may return linear rings or true circular/curved segments.
      if (!polygon.toJSON().curveRings?.length) return polygon;
      return densify(polygon, 0, {
        maxAngleInDegrees: 2,
        maxDeviation: polygon.spatialReference.isWebMercator ? 1 : 0.00001,
      });
    },
    project: (polygon) =>
      shapePreservingProjectExecute(polygon, SpatialReference.WGS84, {
        maxDeviationInSrTo: 0.0000001,
      }),
    union,
    isSimple: simplifyIsSimple,
  });
}
