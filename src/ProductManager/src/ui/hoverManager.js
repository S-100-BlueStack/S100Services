export function createHoverManager(view) {
  const layers = new Set();
  const layerViews = new Map();

  let highlight = null;
  let lastGraphicUid = null;

  let pointerEvent = null;
  let frameRequested = false;

  let lockedGraphic = null;
  let lockedHighlight = null;

  function registerLayer(layer) {
    layers.add(layer);

    view.whenLayerView(layer).then((layerView) => {
      layerViews.set(layer, layerView);
    });
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

    if (lockedGraphic) return;

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

    if (!graphic || graphic.uid === lastGraphicUid) {
      return;
    }

    lastGraphicUid = graphic.uid;

    const layerView = layerViews.get(graphic.layer);
    if (!layerView) return;

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
  }

  function getLockedFeatureId() {
    return lockedGraphic?.attributes?.id || null;
  }

  function getLockedLayerId() {
    return lockedGraphic?.layer?.customId || null;
  }

  return {
    registerLayer,
    setLockedFeature,
    clearLockedFeature,
    getLockedFeatureId,
    getLockedLayerId,
  };
}
