export const FEATURE_COUNT = 6000;
export function featureSummary(index) {
  const type = index < FEATURE_COUNT / 2 ? "NM" : "KP";
  const sequence = (index % (FEATURE_COUNT / 2)) + 1;
  const name = `${type}26${String(sequence).padStart(4, "0")}`;
  return { id: `feature-${index + 1}`, name, type };
}
export function featureIndex(id) {
  const index = Number(String(id).replace(/^feature-/, "")) - 1;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= FEATURE_COUNT ||
    `feature-${index + 1}` !== id
  ) {
    throw new Error("Feature was not found.");
  }
  return index;
}
export function featureDetail(id) {
  const index = featureIndex(id);
  const summary = featureSummary(index);
  return {
    ...summary,
    sourceId: summary.name,
    title:
      summary.type === "NM" ? "Temporary navigation information" : "Reported coastal observation",
    references: index % 3 ? "" : "Previous observation retained for comparison.",
    details:
      index % 7 === 0
        ? Array.from(
            { length: 24 },
            (_, n) =>
              `Observation ${n + 1}: Survey information requires manual assessment. This is deterministic prototype data, not a navigational notice.`
          ).join("\n\n")
        : "Mock geographic observation for assignment testing.",
    nauticalCharts: summary.type === "NM" ? "Mock chart reference" : "",
    publication: summary.type === "NM" ? "Prototype publication 2026" : "",
    geometry: {
      type: "point",
      longitude: 8.2 + (index % 65) / 10,
      latitude: 54.6 + (Math.floor(index / 65) % 30) / 10,
      spatialReference: { wkid: 4326 },
    },
  };
}
