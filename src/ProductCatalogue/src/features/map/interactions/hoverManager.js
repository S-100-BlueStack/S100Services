import { getGraphicFeatureKey } from "../core/featureIdentity.js";

export function createHoverManager(view) {
  const layers = new Set();
  const layerViews = new Map();
  const layerViewPromises = new Map();

  let highlight = null;
  let highlightedGraphic = null;
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

  function unregisterLayer(layer) {
    if (!layer) {
      return false;
    }

    const wasRegistered = layers.delete(layer);
    layerViews.delete(layer);
    layerViewPromises.delete(layer);

    if (highlightedGraphic?.layer === layer) {
      clearHighlight();
    }
    if (lockedGraphic?.layer === layer) {
      clearLockedFeature();
    }

    return wasRegistered;
  }

  function clearSource(sourceId) {
    for (const layer of [...layers]) {
      if (layer?.appSourceId === sourceId || layer?.dataSourceId === sourceId) {
        unregisterLayer(layer);
      }
    }
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

    highlightedGraphic = graphic;
    highlight = layerView.highlight(graphic, {
      name: "hover-highlight",
    });
  }

  function clearHighlight() {
    if (highlight) {
      highlight.remove();
      highlight = null;
    }

    highlightedGraphic = null;
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

  function getLockedSourceId() {
    return (
      lockedGraphic?.attributes?.sourceId ??
      lockedGraphic?.layer?.appSourceId ??
      lockedGraphic?.layer?.dataSourceId ??
      null
    );
  }

  return {
    registerLayer,
    unregisterLayer,
    clearSource,
    setLockedFeature,
    clearLockedFeature,
    getLockedFeatureKey,
    getLockedLayerId,
    getLockedSourceId,
    clear,
  };
}
