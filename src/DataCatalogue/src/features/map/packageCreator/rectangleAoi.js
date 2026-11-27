// The native AOI-only contract accepts a clockwise XY polygon in WKID 4326.
export function rectangleAoi(ring) {
  const invalid = () => new Error("Draw a nonzero rectangle within one side of the date line.");
  if (!Array.isArray(ring) || ring.length !== 5) throw invalid();
  if (
    ring.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(Number.isFinite) ||
        Math.abs(point[0]) > 180 ||
        Math.abs(point[1]) > 90
    )
  ) {
    throw invalid();
  }
  const [[firstX, firstY], , , , [lastX, lastY]] = ring;
  const [west, east] = [Math.min(...ring.map(([x]) => x)), Math.max(...ring.map(([x]) => x))];
  const [south, north] = [Math.min(...ring.map(([, y]) => y)), Math.max(...ring.map(([, y]) => y))];
  if (
    firstX !== lastX ||
    firstY !== lastY ||
    east - west <= 0 ||
    east - west >= 180 ||
    north <= south ||
    new Set(ring.slice(0, 4).map(([x, y]) => `${x},${y}`)).size !== 4 ||
    ring.slice(1).some(([x, y], index) => {
      const [previousX, previousY] = ring[index];
      return (x === previousX) === (y === previousY);
    })
  ) {
    throw invalid();
  }
  return {
    rings: [
      [
        [west, south],
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    ],
    spatialReference: { wkid: 4326 },
  };
}
