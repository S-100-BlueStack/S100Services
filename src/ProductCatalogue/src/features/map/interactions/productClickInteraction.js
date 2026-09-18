import { getGraphicInteractionIdentity } from "../core/featureIdentity.js";

export async function handleProductClick({
  event,
  view,
  getInteractiveLayers,
  getClickCandidates,
  getHighlightedIdentity,
  openGraphic,
  openOverlap,
  closePopup,
  isCurrent = () => true,
}) {
  const directSelectionRequested = isDirectSelectionModifier(event);
  // Capture before awaiting hitTest. A hover result that completes after the
  // click must not retroactively become the target of this interaction.
  const highlightedIdentity = directSelectionRequested ? getHighlightedIdentity?.() : null;
  const interactiveLayers = getInteractiveLayers();

  if (interactiveLayers.length === 0) {
    closePopup();
    return { type: "none" };
  }

  const response = await view.hitTest(event, {
    include: interactiveLayers,
  });

  if (!isCurrent()) {
    return { type: "stale" };
  }

  const currentInteractiveLayers = getInteractiveLayers();
  const graphics = getClickCandidates(response.results, {
    currentInteractiveLayers,
  });
  const decision = resolveProductClickDecision({
    event,
    graphics,
    highlightedIdentity,
  });

  if (!isCurrent()) {
    return { type: "stale" };
  }

  if (decision.type === "none") {
    closePopup();
    return decision;
  }

  if (decision.type === "graphic") {
    openGraphic({
      graphic: decision.graphic,
      location: event.mapPoint,
    });
    return decision;
  }

  openOverlap({
    graphics,
    location: event.mapPoint,
    onSelect: (graphic) => {
      if (
        !isCurrent() ||
        !getClickCandidates([{ graphic }], {
          currentInteractiveLayers: getInteractiveLayers(),
        }).includes(graphic)
      ) {
        return;
      }

      openGraphic({
        graphic,
        location: event.mapPoint,
      });
    },
  });
  return decision;
}

export function bindProductKeyboardActivation({
  view,
  beginInteraction,
  getInteractiveLayers,
  getHighlightedIdentity,
  openGraphic,
}) {
  const keyDownHandle = view.on("key-down", (event) => {
    if (!isDirectSelectionKeyboardShortcut(event) || event.repeat === true) {
      return;
    }

    const isCurrent = beginInteraction();
    const decision = handleProductKeyboardActivation({
      event,
      getInteractiveLayers,
      getHighlightedIdentity,
      openGraphic,
      isCurrent,
    });

    if (decision.type === "graphic") {
      // The map owns this shortcut. Stop ArcGIS from also interpreting the
      // handled key without suppressing unrelated keyboard interaction.
      event.stopPropagation?.();
    }
  });

  return () => keyDownHandle.remove?.();
}

export function handleProductKeyboardActivation({
  event,
  getInteractiveLayers,
  getHighlightedIdentity,
  openGraphic,
  isCurrent = () => true,
}) {
  if (!isDirectSelectionKeyboardShortcut(event) || event.repeat === true) {
    return { type: "ignored" };
  }

  const highlightedIdentity = getHighlightedIdentity?.();

  if (!highlightedIdentity || !isCurrent()) {
    return { type: "none" };
  }

  const currentInteractiveLayers = getInteractiveLayers();
  const graphics = getCurrentInteractiveLayerCandidates(currentInteractiveLayers);
  const graphic = resolveHighlightedDirectSelection(graphics, highlightedIdentity);

  if (!graphic) {
    return { type: "none" };
  }

  if (!isCurrent()) {
    return { type: "stale" };
  }

  const location = getGraphicPopupLocation(graphic);

  if (!location) {
    return { type: "none" };
  }

  openGraphic({ graphic, location });
  return {
    type: "graphic",
    graphic,
    reason: "highlighted-keyboard-selection",
  };
}

export function resolveProductClickDecision({ event, graphics, highlightedIdentity }) {
  if (isDirectSelectionModifier(event)) {
    const highlightedGraphic = resolveHighlightedDirectSelection(graphics, highlightedIdentity);

    if (highlightedGraphic) {
      return {
        type: "graphic",
        graphic: highlightedGraphic,
        reason: "highlighted-modifier-selection",
      };
    }
  }

  if (graphics.length === 0) {
    return { type: "none" };
  }

  if (graphics.length === 1) {
    return {
      type: "graphic",
      graphic: graphics[0],
      reason: "single-candidate",
    };
  }

  return {
    type: "overlap",
    graphics,
    reason: "multiple-candidates",
  };
}

export function resolveHighlightedDirectSelection(graphics, highlightedIdentity) {
  if (!highlightedIdentity) {
    return null;
  }

  return (
    graphics.find((graphic) => getGraphicInteractionIdentity(graphic) === highlightedIdentity) ??
    null
  );
}

export function isDirectSelectionModifier(event) {
  const nativeEvent = event?.native;

  if (!nativeEvent || nativeEvent.shiftKey === true) {
    return false;
  }

  return nativeEvent.ctrlKey === true || nativeEvent.metaKey === true;
}

export function isDirectSelectionKeyboardShortcut(event) {
  return event?.key === "Enter" && isDirectSelectionModifier(event);
}

export function getValidUniqueClickCandidates(results, { currentInteractiveLayers } = {}) {
  const graphics = [];
  const seen = new Set();
  const currentLayerSet = currentInteractiveLayers ? new Set(currentInteractiveLayers) : null;

  for (const result of results) {
    const graphic = result.graphic;

    if (
      !graphic?.attributes ||
      graphic.visible === false ||
      graphic.layer?.visible === false ||
      (currentLayerSet &&
        (!currentLayerSet.has(graphic.layer) || !isCurrentLayerGraphic(graphic.layer, graphic)))
    ) {
      continue;
    }

    const key = getUniqueGraphicKey(graphic);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    graphics.push(graphic);
  }

  return graphics;
}

export function getCurrentInteractiveLayerCandidates(currentInteractiveLayers = []) {
  const results = [];

  for (const layer of currentInteractiveLayers) {
    for (const graphic of getLayerGraphics(layer)) {
      results.push({ graphic });
    }
  }

  return getValidUniqueClickCandidates(results, { currentInteractiveLayers });
}

export function createProductClickSession() {
  let generation = 0;
  let active = true;

  return {
    begin() {
      const interactionGeneration = ++generation;
      return () => active && interactionGeneration === generation;
    },
    destroy() {
      if (!active) {
        return;
      }

      active = false;
      generation += 1;
    },
  };
}

function getUniqueGraphicKey(graphic) {
  const featureKey = graphic.attributes?.featureKey;
  const layerId = graphic.layer?.appLayerId ?? graphic.layer?.customId;

  if (featureKey && layerId) {
    return `${layerId}:${featureKey}`;
  }

  return graphic.uid;
}

function isCurrentLayerGraphic(layer, graphic) {
  const featureKey = graphic?.attributes?.featureKey;

  if (featureKey && layer?._index instanceof Map) {
    return layer._index.get(featureKey) === graphic;
  }

  const layerGraphics = layer?.graphics;

  if (Array.isArray(layerGraphics)) {
    return layerGraphics.includes(graphic);
  }

  if (typeof layerGraphics?.includes === "function") {
    return layerGraphics.includes(graphic);
  }

  const graphicsArray = layerGraphics?.toArray?.();
  return Array.isArray(graphicsArray) && graphicsArray.includes(graphic);
}

function getLayerGraphics(layer) {
  const layerGraphics = layer?.graphics;

  if (Array.isArray(layerGraphics)) {
    return layerGraphics;
  }

  const graphicsArray = layerGraphics?.toArray?.();
  return Array.isArray(graphicsArray) ? graphicsArray : [];
}

function getGraphicPopupLocation(graphic) {
  const geometry = graphic?.geometry;

  if (!geometry) {
    return null;
  }

  // Prefer extent.center so polygon activation does not rely on the deprecated
  // geometry.centroid property in newer ArcGIS SDK versions.
  return geometry.extent?.center ?? geometry;
}
