import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { isGraphicVisibleAtScale } from "./displayScale.js";

let activeScaleHandle = null;
let pendingAnimationFrame = null;

export function bindDisplayScaleVisibility(view, { layers }) {
  removeDisplayScaleVisibilityBinding();

  const updateVisibility = () => {
    applyDisplayScaleVisibility(view, layers);
  };

  const scheduleVisibilityUpdate = () => {
    if (pendingAnimationFrame !== null) {
      return;
    }

    pendingAnimationFrame = window.requestAnimationFrame(() => {
      pendingAnimationFrame = null;
      updateVisibility();
    });
  };

  activeScaleHandle = watch(
    () => view.scale,
    () => {
      scheduleVisibilityUpdate();
    },
    {
      initial: true,
    }
  );

  return {
    remove: removeDisplayScaleVisibilityBinding,
  };
}

export function applyDisplayScaleVisibility(view, layers) {
  if (!view || !Array.isArray(layers)) {
    return;
  }

  const viewScale = view.scale;

  if (!Number.isFinite(viewScale)) {
    return;
  }

  for (const layer of layers) {
    const graphics = layer.graphics?.toArray?.() ?? [];

    for (const graphic of graphics) {
      graphic.visible = isGraphicVisibleAtScale(graphic, viewScale);
    }
  }
}

function removeDisplayScaleVisibilityBinding() {
  if (activeScaleHandle) {
    activeScaleHandle.remove();
    activeScaleHandle = null;
  }

  if (pendingAnimationFrame !== null) {
    window.cancelAnimationFrame(pendingAnimationFrame);
    pendingAnimationFrame = null;
  }
}
