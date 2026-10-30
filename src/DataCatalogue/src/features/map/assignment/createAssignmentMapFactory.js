export function createAssignmentMapFactory({ sourceMode, catalogue, liveMap, mockMap }) {
  if (sourceMode === "mock") return mockMap;
  if (sourceMode !== "live") throw new Error("Unsupported assignment map source.");
  // A live map error must never select demo geography or bypass the API service boundary.
  return (options) => liveMap({ ...options, catalogue });
}
