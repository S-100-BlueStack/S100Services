// Keep the default extent local to Denmark while allowing an explicit
// Denmark/Greenland overview without recreating either MapView.
const DEFAULT_CENTER = Object.freeze([10.4, 56.15]);
const DEFAULT_CONSTRAINTS = Object.freeze({
  minZoom: 0,
  rotationEnabled: false,
});

export const DEFAULT_ZOOM = 6;

export function createDefaultMapViewOptions() {
  return {
    center: [...DEFAULT_CENTER],
    zoom: DEFAULT_ZOOM,
    constraints: { ...DEFAULT_CONSTRAINTS },
  };
}
