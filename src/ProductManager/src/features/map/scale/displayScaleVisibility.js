import { isGraphicVisibleAtScale } from "./displayScale.js";

let activeScaleHandle = null;
let pendingAnimationFrame = null;

export function bindDisplayScaleVisibility(view, { layers }) {
  if (activeScaleHandle) {
    activeScaleHandle.remove();
    activeScaleHandle = null;
  }

  const updateVisibility = () => {
    applyDisplayScaleVisibility(view, layers);
  };

  updateVisibility();

  activeScaleHandle = view.watch("scale", () => {
    if (pendingAnimationFrame !== null) {
      return;
    }

    pendingAnimationFrame = window.requestAnimationFrame(() => {
      pendingAnimationFrame = null;
      updateVisibility();
    });
  });

  return activeScaleHandle;
}

export function applyDisplayScaleVisibility(view, layers) {
  const viewScale = view.scale;

  for (const layer of layers) {
    const graphics = layer.graphics?.toArray?.() ?? [];

    for (const graphic of graphics) {
      graphic.visible = isGraphicVisibleAtScale(graphic, viewScale);
    }
  }
}
