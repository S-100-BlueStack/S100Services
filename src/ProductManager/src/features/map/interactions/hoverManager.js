import { getGraphicFeatureKey } from "../core/featureIdentity.js";

export function createHoverManager(view) {
  const layers = new Set();
  const layerViews = new Map();
  const layerViewPromises = new Map();

  let highlight = null;
  let lastGraphicUid = null;
  let pointerEvent = null;
  let frameRequested = false;
  let lockedGraphic = null;
  let lockedHighlight = null;

  function registerLayer(layer) {
    layers.add(layer);

    const existingPromise = layerViewPromises.get(layer);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = view.whenLayerView(layer).then((layerView) => {
      // A refresh can clear the manager while layer views are still resolving.
      // Only cache the layer view if the layer is still active in this manager.
      if (layers.has(layer)) {
        layerViews.set(layer, layerView);
      }

      return layerView;
    });

    layerViewPromises.set(layer, promise);

    return promise;
  }

  view.on("pointer-move", (event) => {
    pointerEvent = event;

    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(runHitTest);
    }
  });

  async function runHitTest() {
    frameRequested = false;

    if (!pointerEvent || layers.size === 0) return;

    const hit = await view.hitTest(pointerEvent, {
      include: [...layers],
    });

    if (!hit.results.length) {
      clearHighlight();
      return;
    }

    const result = hit.results[0];
    const graphic = result.graphic;

    if (!graphic) {
      clearHighlight();
      return;
    }

    if (lockedGraphic && graphic.uid === lockedGraphic.uid) {
      clearHighlight();
      lastGraphicUid = graphic.uid;
      return;
    }

    if (graphic.uid === lastGraphicUid) {
      return;
    }

    lastGraphicUid = graphic.uid;

    const layerView = layerViews.get(graphic.layer);

    if (!layerView) {
      clearHighlight();
      return;
    }

    if (highlight) {
      highlight.remove();
    }

    highlight = layerView.highlight(graphic, {
      name: "hover-highlight",
    });
  }

  function clearHighlight() {
    if (highlight) {
      highlight.remove();
      highlight = null;
    }

    lastGraphicUid = null;
  }

  function setLockedFeature(graphic) {
    clearHighlight();
    lockedGraphic = graphic;

    const layerView = layerViews.get(graphic.layer);
    if (!layerView) return;

    if (lockedHighlight) {
      lockedHighlight.remove();
    }

    lockedHighlight = layerView.highlight(graphic, {
      name: "hover-highlight",
    });
  }

  function clearLockedFeature() {
    if (lockedHighlight) {
      lockedHighlight.remove();
      lockedHighlight = null;
    }

    lockedGraphic = null;
    lastGraphicUid = null;
  }

  function clear() {
    layers.clear();
    layerViews.clear();
    layerViewPromises.clear();
    clearHighlight();
    clearLockedFeature();
  }

  function getLockedFeatureKey() {
    return getGraphicFeatureKey(lockedGraphic);
  }

  function getLockedLayerId() {
    return lockedGraphic?.layer?.customId || null;
  }

  return {
    registerLayer,
    setLockedFeature,
    clearLockedFeature,
    getLockedFeatureKey,
    getLockedLayerId,
    clear,
  };
}
