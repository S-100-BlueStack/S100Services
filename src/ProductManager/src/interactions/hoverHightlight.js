export function enableHoverHighlight(view, layer) {
  let highlight = null;
  let layerView = null;
  let lastGraphic = null;

  let pointerEvent = null;
  let frameRequested = false;

  view.whenLayerView(layer).then((lv) => {
    layerView = lv;
  });

  view.on("pointer-move", (event) => {
    pointerEvent = event;

    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(runHitTest);
    }
  });

  async function runHitTest() {
    frameRequested = false;

    if (!pointerEvent || !layerView) return;

    const hit = await view.hitTest(pointerEvent, {
      include: layer,
    });

    const result = hit.results.find((r) => r.graphic.layer === layer);

    if (!result) {
      if (highlight) {
        highlight.remove();
        highlight = null;
        lastGraphic = null;
      }
      return;
    }

    const graphic = result.graphic;

    if (lastGraphic && lastGraphic.uid === graphic.uid) {
      return;
    }

    lastGraphic = graphic;

    if (highlight) {
      highlight.remove();
    }

    highlight = layerView.highlight(graphic, {
      name: "hover-highlight",
    });
  }
}
