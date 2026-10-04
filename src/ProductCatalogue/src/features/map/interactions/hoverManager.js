import { getGraphicFeatureKey, getGraphicInteractionIdentity } from "../core/featureIdentity.js";

export function createHoverManager(view) {
  const layers = new Set();
  const layerViews = new Map();
  const layerViewPromises = new Map();
  const highlightedIdentityListeners = new Set();

  let highlight = null;
  let highlightedGraphic = null;
  let lastGraphicUid = null;
  let pointerEvent = null;
  let frameRequested = false;
  let lockedGraphic = null;
  let lockedHighlight = null;
  let hoverGeneration = 0;
  let destroyed = false;
  let publishedHighlightedIdentity = null;

  function registerLayer(layer) {
    if (destroyed) {
      return Promise.resolve(null);
    }

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
    hoverGeneration += 1;
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

  const pointerMoveHandle = view.on("pointer-move", (event) => {
    hoverGeneration += 1;
    pointerEvent = event;

    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(runHitTest);
    }
  });

  const pointerLeaveHandle = view.on("pointer-leave", () => {
    hoverGeneration += 1;
    pointerEvent = null;
    clearHighlight();
  });

  async function runHitTest() {
    frameRequested = false;

    if (destroyed || !pointerEvent || layers.size === 0) return;

    const requestedEvent = pointerEvent;
    const requestedGeneration = hoverGeneration;
    const hit = await view.hitTest(requestedEvent, {
      include: [...layers],
    });

    // Pointer movement, layer reconciliation and popup locking can all supersede
    // an in-flight hit test. A late result must not restore obsolete hover state.
    if (destroyed || requestedGeneration !== hoverGeneration || requestedEvent !== pointerEvent) {
      return;
    }

    if (!hit.results.length) {
      clearHighlight();
      return;
    }
    const result = hit.results[0];
    const graphic = result.graphic;

    if (
      !graphic ||
      !layers.has(graphic.layer) ||
      graphic.visible === false ||
      graphic.layer?.visible === false
    ) {
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
    publishHighlightedIdentity();
  }

  function clearHighlight() {
    if (highlight) {
      highlight.remove();
      highlight = null;
    }

    highlightedGraphic = null;
    lastGraphicUid = null;
    publishHighlightedIdentity();
  }

  function setLockedFeature(graphic) {
    hoverGeneration += 1;
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
    hoverGeneration += 1;

    if (lockedHighlight) {
      lockedHighlight.remove();
      lockedHighlight = null;
    }

    lockedGraphic = null;
    lastGraphicUid = null;
  }

  function clear() {
    hoverGeneration += 1;
    pointerEvent = null;
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

  function getHighlightedGraphicIdentity() {
    return getGraphicInteractionIdentity(highlightedGraphic);
  }

  function subscribeHighlightedGraphicIdentity(listener) {
    if (destroyed || typeof listener !== "function") {
      return () => {};
    }

    highlightedIdentityListeners.add(listener);
    listener(getHighlightedGraphicIdentity());

    return () => highlightedIdentityListeners.delete(listener);
  }

  function publishHighlightedIdentity() {
    const identity = getHighlightedGraphicIdentity();

    if (identity === publishedHighlightedIdentity) {
      return;
    }

    publishedHighlightedIdentity = identity;
    for (const listener of highlightedIdentityListeners) {
      listener(identity);
    }
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    hoverGeneration += 1;
    pointerEvent = null;
    frameRequested = false;
    pointerMoveHandle?.remove?.();
    pointerLeaveHandle?.remove?.();
    clear();
    highlightedIdentityListeners.clear();
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
    getHighlightedGraphicIdentity,
    subscribeHighlightedGraphicIdentity,
    clear,
    destroy,
  };
}
