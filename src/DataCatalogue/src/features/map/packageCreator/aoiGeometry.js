import { normalizePackageGeometry } from "../../../shared/api/packageGeometry.js";

const WGS84 = 4326;
const WORLD_EDGE_X = 20037508.342789244;
const WORLD_EDGE_Y = 20037508.342789248;
const WORLD_ERROR = "Keep each AOI area within one side of the date line and the visible world.";

function assertPolygon(geometry) {
  if (geometry?.type !== "polygon" || geometry.hasZ || geometry.hasM || !geometry.extent) {
    throw new Error("Draw a nonempty two-dimensional AOI area.");
  }
}

function assertBounds({ xmin, xmax, ymin, ymax }, webMercator) {
  const limitX = webMercator ? WORLD_EDGE_X : 180;
  const limitY = webMercator ? WORLD_EDGE_Y : 90;
  if (
    ![xmin, xmax, ymin, ymax].every(Number.isFinite) ||
    !(xmin < xmax && ymin < ymax) ||
    xmin < -limitX ||
    xmax > limitX ||
    (webMercator && (xmin === -limitX || xmax === limitX)) ||
    ymin < -limitY ||
    ymax > limitY
  ) {
    throw new Error(WORLD_ERROR);
  }
}

function assertRings(rings, halfWorldWidth) {
  if (!Array.isArray(rings) || !rings.length) throw new Error("The AOI has no polygon rings.");
  for (const ring of rings) {
    if (
      !Array.isArray(ring) ||
      ring.length < 4 ||
      ring.some(
        (point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      )
    ) {
      throw new Error("The AOI has invalid ring coordinates.");
    }
    let west = Infinity;
    let east = -Infinity;
    for (const [x] of ring) {
      west = Math.min(west, x);
      east = Math.max(east, x);
    }
    // Disjoint parts can span a wide extent. No continuous ring may wrap across the date line.
    if (east - west >= halfWorldWidth) throw new Error(WORLD_ERROR);
  }
}

export function createAoiGeometry({ linearize, project, union, isSimple }) {
  function prepare(geometry) {
    assertPolygon(geometry);
    const sr = geometry.spatialReference;
    if (!sr?.isWebMercator && sr?.wkid !== WGS84) {
      throw new Error("Drawing requires a WGS 84 or Web Mercator map.");
    }
    assertBounds(geometry.extent, sr.isWebMercator);
    const polygon = linearize(geometry);
    assertPolygon(polygon);
    if (!sr.equals(polygon.spatialReference)) throw new Error("AOI spatial reference changed.");
    assertRings(polygon.rings, sr.isWebMercator ? WORLD_EDGE_X : 180);
    if (!isSimple(polygon)) throw new Error("The AOI area has invalid polygon topology.");
    return polygon;
  }

  function combine(polygons) {
    if (!polygons.length) return null;
    const sr = polygons[0].spatialReference;
    if (!polygons.every((polygon) => sr.equals(polygon.spatialReference))) {
      throw new Error("All AOI areas must use the same map spatial reference.");
    }

    // Dissolve in the source plane before projection so adjacent and overlapping edges join.
    const combined = polygons.length === 1 ? polygons[0] : union(polygons);
    assertPolygon(combined);
    if (!sr.equals(combined.spatialReference)) throw new Error("AOI spatial reference changed.");
    const geographic = sr.wkid === WGS84 ? combined : project(combined);
    assertPolygon(geographic);
    if (geographic.spatialReference?.wkid !== WGS84) {
      throw new Error("The AOI could not be converted to WGS 84.");
    }
    assertBounds(geographic.extent, false);
    assertRings(geographic.rings, 180);
    if (!isSimple(geographic)) throw new Error("The combined AOI has invalid polygon topology.");

    // Use the same exact XY, ring closure and size checks as the committed geometry reader.
    return normalizePackageGeometry({
      aoi: { rings: geographic.rings, spatialReference: { wkid: WGS84 } },
      detailedGeometry: null,
    }).aoi;
  }

  return { prepare, combine };
}
