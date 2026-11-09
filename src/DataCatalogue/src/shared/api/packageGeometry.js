// Package geometry is an API-owned shape, not a Workspace or a browser Feature Service.
// Normalize its Esri JSON at the service boundary before handing it to the map adapter.
const MAX_GEOMETRY_JSON_LENGTH = 8_000_000;
const MAX_COORDINATES = 150_000;
const MAX_GEOMETRY_PARTS = 10_000;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function spatialReference(value) {
  if (!record(value)) throw new Error("Package geometry requires a spatial reference.");
  for (const key of ["wkid", "latestWkid"]) {
    if (value[key] != null && (!Number.isSafeInteger(value[key]) || value[key] <= 0)) {
      throw new Error("Package geometry has an invalid spatial reference WKID.");
    }
  }
  if (value.wkt != null && (typeof value.wkt !== "string" || !value.wkt.trim())) {
    throw new Error("Package geometry has an invalid spatial reference WKT.");
  }
  const wkid = value.latestWkid ?? value.wkid;
  if (wkid != null) return { wkid };
  if (value.wkt) return { wkt: value.wkt };
  throw new Error("Package geometry requires a known spatial reference.");
}

function coordinate(position, spatialRef) {
  if (
    !Array.isArray(position) ||
    position.length < 2 ||
    position.length > 4 ||
    !position.slice(0, 2).every(Number.isFinite) ||
    !position.slice(2).every((number) => number == null || Number.isFinite(number))
  ) {
    throw new Error("Package geometry contains invalid coordinates.");
  }
  const [x, y] = position;
  if (spatialRef.wkid === 4326 && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
    throw new Error("Package geometry contains out-of-range WGS84 coordinates.");
  }
  // Display geometry is deliberately 2D; nullable source Z/M must not invalidate XY.
  return [x, y];
}

function coordinateBudget(budget) {
  budget.count++;
  if (budget.count > MAX_COORDINATES)
    throw new Error("Package geometry exceeds the supported coordinate display limit.");
}

function curveMember(value, sr, budget, depth = 0) {
  if (depth > 6) throw new Error("Package geometry has an invalid curve structure.");
  if (Array.isArray(value)) {
    if (value.length > MAX_GEOMETRY_PARTS)
      throw new Error("Package geometry exceeds the supported curve display limit.");
    if (value.length >= 2 && value.slice(0, 2).every(Number.isFinite)) {
      coordinateBudget(budget);
      return [
        ...coordinate(value, sr),
        ...value.slice(2).map((n) => {
          if (typeof n !== "number" || !Number.isFinite(n))
            throw new Error("Package geometry has an invalid curve parameter.");
          return n;
        }),
      ];
    }
    return value.map((item) => curveMember(item, sr, budget, depth + 1));
  }
  if (record(value)) {
    const names = Object.keys(value);
    if (names.length !== 1 || !["c", "a", "b"].includes(names[0]))
      throw new Error("Package geometry contains an unsupported curve segment.");
    return { [names[0]]: curveMember(value[names[0]], sr, budget, depth + 1) };
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Package geometry has an invalid curve parameter.");
}

function coordinateGroups(value, name, sr, budget, { ring = false, curved = false } = {}) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_GEOMETRY_PARTS) {
    throw new Error(`Package ${name} geometry has no valid coordinate groups.`);
  }
  return value.map((group) => {
    if (!Array.isArray(group) || group.length < 2) {
      throw new Error(`Package ${name} geometry has an incomplete ${ring ? "ring" : "path"}.`);
    }
    const points = group.map((point) => {
      if (curved && record(point)) return curveMember(point, sr, budget);
      coordinateBudget(budget);
      return coordinate(point, sr);
    });
    if (!curved && ring) {
      if (points.length < 4) throw new Error("Package polygon has an incomplete ring.");
      const first = points[0];
      const last = points.at(-1);
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new Error("Package polygon ring is not closed.");
      }
      const area = points.slice(1).reduce((sum, point, index) => {
        const previous = points[index];
        return (
          sum +
          (previous[0] - first[0]) * (point[1] - first[1]) -
          (point[0] - first[0]) * (previous[1] - first[1])
        );
      }, 0);
      if (!Number.isFinite(area) || area === 0) {
        throw new Error("Package polygon ring has no finite area.");
      }
    }
    return points;
  });
}

function polygon(value, name, budget) {
  if (!record(value)) throw new Error(`Package ${name} must be an Esri polygon.`);
  const sr = spatialReference(value.spatialReference);
  if (Array.isArray(value.rings) && value.rings.length) {
    return {
      rings: coordinateGroups(value.rings, name, sr, budget, { ring: true }),
      spatialReference: sr,
    };
  }
  if (Array.isArray(value.curveRings) && value.curveRings.length) {
    return {
      curveRings: coordinateGroups(value.curveRings, name, sr, budget, {
        ring: true,
        curved: true,
      }),
      spatialReference: sr,
    };
  }
  throw new Error(`Package ${name} must contain polygon rings.`);
}

function polyline(value, budget) {
  if (!record(value)) throw new Error("Package curves must be an Esri polyline.");
  const sr = spatialReference(value.spatialReference);
  if (Array.isArray(value.paths) && value.paths.length) {
    return {
      paths: coordinateGroups(value.paths, "curve", sr, budget),
      spatialReference: sr,
    };
  }
  if (Array.isArray(value.curvePaths) && value.curvePaths.length) {
    return {
      curvePaths: coordinateGroups(value.curvePaths, "curve", sr, budget, { curved: true }),
      spatialReference: sr,
    };
  }
  throw new Error("Package curves must contain polyline paths.");
}

function pointOrMultipoint(value, budget) {
  if (!record(value)) throw new Error("Package point must be Esri point or multipoint geometry.");
  const sr = spatialReference(value.spatialReference);
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    coordinateBudget(budget);
    const [x, y] = coordinate([value.x, value.y], sr);
    return { x, y, spatialReference: sr };
  }
  if (
    !Array.isArray(value.points) ||
    !value.points.length ||
    value.points.length > MAX_COORDINATES
  ) {
    throw new Error("Package multipoint requires coordinates.");
  }
  return {
    points: value.points.map((point) => {
      coordinateBudget(budget);
      return coordinate(point, sr);
    }),
    spatialReference: sr,
  };
}

export function normalizePackageGeometry(value) {
  if (!record(value) || !("aoi" in value) || !("detailedGeometry" in value)) {
    throw new Error("API returned an invalid Package geometry envelope.");
  }
  let wireLength;
  try {
    wireLength = JSON.stringify(value)?.length;
  } catch {
    throw new Error("API returned a non-serializable Package geometry envelope.");
  }
  if (!wireLength || wireLength > MAX_GEOMETRY_JSON_LENGTH) {
    throw new Error("Package geometry exceeds the supported response display limit.");
  }
  const budget = { count: 0 };
  const aoi = value.aoi == null ? null : polygon(value.aoi, "AOI", budget);
  const details = value.detailedGeometry;
  if (details == null) return { aoi, detailedGeometry: null };
  if (
    !record(details) ||
    !Array.isArray(details.points) ||
    details.points.length > MAX_GEOMETRY_PARTS
  ) {
    throw new Error("API returned invalid detailed Package geometry.");
  }
  return {
    aoi,
    detailedGeometry: {
      points: details.points.map((point) => pointOrMultipoint(point, budget)),
      curves: details.curves == null ? null : polyline(details.curves, budget),
      surfaces: details.surfaces == null ? null : polygon(details.surfaces, "surface", budget),
    },
  };
}
