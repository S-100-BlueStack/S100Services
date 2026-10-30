import { requiredId } from "./catalogueService.js";

export function workspaceGeometryKey(workspace) {
  return JSON.stringify([requiredId(workspace?.pipelineId), requiredId(workspace?.workspaceId)]);
}

// Geometry references remain opaque identity metadata, never a source of coordinates.
export function workspaceGeometryContextKey(workspace) {
  return JSON.stringify([
    workspaceGeometryKey(workspace),
    workspace.geometryRef?.featureClass ?? null,
    workspace.geometryRef?.globalId ?? null,
  ]);
}

export function normalizeWorkspacePolygon(esriJSON) {
  if (esriJSON == null || esriJSON === "") throw new Error("Workspace polygon is unavailable.");
  if (typeof esriJSON !== "string" || esriJSON.length > 2_000_000)
    throw new Error("Workspace polygon must be an Esri JSON string of at most 2 MB.");
  let value;
  try {
    value = JSON.parse(esriJSON);
  } catch {
    throw new Error("Workspace polygon contains invalid Esri JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Workspace geometry must be a polygon.");
  if (value.curveRings)
    throw new Error("Workspace curve polygons are not supported by this map adapter.");
  if (
    value.x != null ||
    value.paths ||
    value.points ||
    !Array.isArray(value.rings) ||
    !value.rings.length
  )
    throw new Error("Workspace geometry must contain nonempty polygon rings.");
  const sr = value.spatialReference;
  if (!sr || typeof sr !== "object" || Array.isArray(sr))
    throw new Error("Workspace polygon requires an explicit spatial reference.");
  for (const id of [sr.wkid, sr.latestWkid]) {
    if (id != null && (!Number.isSafeInteger(id) || id <= 0))
      throw new Error("Workspace spatial reference has an invalid WKID.");
  }
  if (sr.wkt != null && (typeof sr.wkt !== "string" || !sr.wkt.trim()))
    throw new Error("Workspace spatial reference has invalid WKT.");
  if (sr.wkid == null && sr.latestWkid == null && !sr.wkt)
    throw new Error("Workspace polygon requires a known spatial reference.");
  // Display a 2D footprint; Z/M and vertical references are not projected as elevations.
  const spatialReference =
    sr.latestWkid || sr.wkid ? { wkid: sr.latestWkid || sr.wkid } : { wkt: sr.wkt };
  let count = 0;
  const rings = value.rings.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 4)
      throw new Error("Workspace polygon has an incomplete ring.");
    count += ring.length;
    if (count > 100_000)
      throw new Error("Workspace polygon exceeds the 100,000 vertex display limit.");
    const points = ring.map((point) => {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        point.length > 4 ||
        !point.slice(0, 2).every(Number.isFinite) ||
        !point.slice(2).every((value) => value == null || Number.isFinite(value))
      )
        throw new Error("Workspace polygon contains invalid coordinates.");
      const [x, y] = point;
      if (spatialReference.wkid === 4326 && (Math.abs(x) > 180 || Math.abs(y) > 90))
        throw new Error("Workspace polygon contains out-of-range WGS84 coordinates.");
      return [x, y];
    });
    const first = points[0];
    const last = points.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1])
      throw new Error("Workspace polygon ring is not closed.");
    // Translate before summing to avoid cancellation at large projected coordinate offsets.
    const area = points.slice(1).reduce((sum, point, index) => {
      const previous = points[index];
      return (
        sum +
        (previous[0] - first[0]) * (point[1] - first[1]) -
        (point[0] - first[0]) * (previous[1] - first[1])
      );
    }, 0);
    if (!Number.isFinite(area) || area === 0)
      throw new Error("Workspace polygon ring has no finite area.");
    return points;
  });
  return { rings, spatialReference };
}
