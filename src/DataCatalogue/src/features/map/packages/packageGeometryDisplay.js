// ArcGIS Point.extent is null by design. Validate projected points by their
// coordinates rather than requiring the extent used by multipart geometries.
export function assertDisplayablePackageGeometry(geometry) {
  if (geometry?.type === "point") {
    if (!Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) {
      throw new Error("Package point has invalid coordinates after projection.");
    }
    return;
  }

  const extent = geometry?.extent;
  if (!extent || ![extent.xmin, extent.ymin, extent.xmax, extent.ymax].every(Number.isFinite)) {
    throw new Error("Package geometry is empty or unsupported after projection.");
  }
  if (geometry.type === "polygon" && (extent.width <= 0 || extent.height <= 0)) {
    throw new Error("Package polygon has an empty extent after projection.");
  }
}

// Use a zero-size extent for a Point only when calculating a combined focus
// area. This does not modify the SDK geometry or affect its graphic symbol.
export function packageGeometryFocusTarget(prepared, createPointExtent) {
  let extent = prepared.aoiGeometry?.extent ?? null;
  if (!extent) {
    for (const graphic of prepared.graphics) {
      const geometry = graphic.geometry;
      const part = geometry.type === "point" ? createPointExtent(geometry) : geometry.extent;
      if (!part) continue;
      extent = extent ? extent.union(part) : part.clone();
    }
  }
  if (!extent) return null;
  if (extent.width === 0 && extent.height === 0) {
    const point = prepared.graphics.find((graphic) => graphic.geometry.type === "point")?.geometry;
    return { target: point ?? extent.center, zoom: 10 };
  }
  return extent.expand(1.2);
}
