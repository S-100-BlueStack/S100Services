export function createUnavailableCatalogueMap({ onStatus }) {
  onStatus(
    "Live geometry unavailable: the approved Feature Service, layer/GlobalID mapping and spatial references have not been verified. No Package or Workspace overlays are displayed."
  );
  return { selectFeature() {}, setAssigned() {}, destroy() {} };
}
