export function enableHoverHighlight(view, layer) {
  let highlight = null;
  let layerView = null;
  let lastGraphic = null;
  let hitTestRunning = false;

  view.whenLayerView(layer).then((lv) => {
    layerView = lv;
  });

  view.on("pointer-move", async (event) => {
    if (!layerView) return;
    if (hitTestRunning) return;

    hitTestRunning = true;

    const hit = await view.hitTest(event, {
      include: layer,
    });

    hitTestRunning = false;

    if (!hit.results.length) {
      if (highlight) {
        highlight.remove();
        highlight = null;
        lastGraphic = null;
      }
      return;
    }

    const graphic = hit.results[0].graphic;

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
  });
}
