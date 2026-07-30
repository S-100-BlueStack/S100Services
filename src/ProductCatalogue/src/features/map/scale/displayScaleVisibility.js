import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { layerSupportsCapability } from "../config/layerDefinitions.js";
import { isGraphicVisibleAtScale } from "./displayScale.js";
import {
  isDisplayScaleHidingDisabled,
  onDisplayScaleOverrideChange,
} from "./displayScaleOverrideState.js";

let activeScaleHandle = null;
let activeOverrideHandle = null;
let pendingAnimationFrame = null;

export function bindDisplayScaleVisibility(view, { layers, isGraphicAllowed = () => true } = {}) {
  removeDisplayScaleVisibilityBinding();

  const boundLayers = normalizeLayers(layers);

  const updateVisibility = () => {
    applyDisplayScaleVisibility(view, boundLayers, {
      isGraphicAllowed,
    });
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

  activeOverrideHandle = onDisplayScaleOverrideChange(() => {
    scheduleVisibilityUpdate();
  });

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

  const ignoreDisplayScale = isDisplayScaleHidingDisabled();

  for (const layer of targetLayers) {
    const graphics = layer.graphics?.toArray?.() ?? [];
    const supportsDisplayScale = layerSupportsCapability(layer, "supportsDisplayScale");

    for (const graphic of graphics) {
      const visibleAtScale =
        !supportsDisplayScale || ignoreDisplayScale || isGraphicVisibleAtScale(graphic, viewScale);

      // Keep filter visibility separate from displayScale visibility so filters
      // still hide graphics even when the user disables scale-based hiding.
      graphic.visible = visibleAtScale && isGraphicAllowed(graphic, layer);
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

  if (activeOverrideHandle) {
    activeOverrideHandle.remove();
    activeOverrideHandle = null;
  }

  if (pendingAnimationFrame !== null) {
    window.cancelAnimationFrame(pendingAnimationFrame);
    pendingAnimationFrame = null;
  }
}
