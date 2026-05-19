import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { isGraphicVisibleAtScale } from "./displayScale.js";

let activeScaleHandle = null;
let pendingAnimationFrame = null;

export function bindDisplayScaleVisibility(view, { layers, isGraphicAllowed = () => true } = {}) {
  removeDisplayScaleVisibilityBinding();

  const boundLayers = normalizeLayers(layers);

  const updateVisibility = () => {
    applyDisplayScaleVisibility(view, boundLayers, { isGraphicAllowed });
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

  updateVisibility();

  activeScaleHandle = watch(
    () => view.scale,
    () => {
      scheduleVisibilityUpdate();
    }
  );

  return {
    remove: removeDisplayScaleVisibilityBinding,
  };
}

export function applyDisplayScaleVisibility(view, layers, { isGraphicAllowed = () => true } = {}) {
  const targetLayers = normalizeLayers(layers);

  if (!view || !targetLayers.length) {
    return;
  }

  const viewScale = Number(view.scale);

  if (!Number.isFinite(viewScale)) {
    return;
  }

  for (const layer of targetLayers) {
    const graphics = layer.graphics?.toArray?.() ?? [];

    for (const graphic of graphics) {
      graphic.visible =
        isGraphicVisibleAtScale(graphic, viewScale) && isGraphicAllowed(graphic, layer);
    }
  }
}

function normalizeLayers(layers) {
  if (!layers) {
    return [];
  }

  return Array.isArray(layers) ? layers : [layers];
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
