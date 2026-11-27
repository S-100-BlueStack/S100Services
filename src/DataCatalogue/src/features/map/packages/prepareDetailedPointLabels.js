// The API returns point references in their stored order. Number source members,
// not projected multipart members, because rendering must not determine identity.
export async function prepareDetailedPointLabels(groups, projectPoint, ensureCurrent) {
  const anchors = new Map();
  let sequence = 0;

  function append(geometry, number) {
    // All anchors have already been projected to the same MapView SR. Keep every
    // sequence position, even when several source points share one display location.
    const key = JSON.stringify([geometry.x, geometry.y]);
    let entry = anchors.get(key);
    if (!entry) {
      entry = { id: String(number), geometry, numbers: [] };
      anchors.set(key, entry);
    }
    entry.numbers.push(number);
  }

  for (const { source, geometry } of groups) {
    ensureCurrent();
    if (Array.isArray(source.points)) {
      for (const [x, y] of source.points) {
        ensureCurrent();
        const number = ++sequence;
        // Project each source member independently instead of relying on the
        // order of vertices in the projected multipoint used for the marker.
        const anchor = await projectPoint({ x, y, spatialReference: source.spatialReference });
        ensureCurrent();
        append(anchor, number);
      }
    } else {
      append(geometry, ++sequence);
    }
  }
  return Array.from(anchors.values(), ({ id, geometry, numbers }) => ({
    id,
    geometry,
    text: numbers.join(", "),
  }));
}
