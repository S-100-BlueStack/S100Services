export function createRectangleSketch({
  component,
  host,
  view,
  layer,
  symbol,
  clearSketch,
  clearDraft,
  acceptGeometry,
  onState,
}) {
  Object.assign(component, {
    view,
    layer,
    autoDestroyDisabled: true,
    defaultGraphicsLayerDisabled: true,
    availableCreateTools: ["rectangle"],
    defaultCreateOptions: { mode: "freehand" },
    creationMode: "single",
    polygonSymbol: symbol,
    updateOnGraphicClickDisabled: true,
    hideSelectionToolsLassoSelection: true,
    hideSelectionToolsRectangleSelection: true,
    hideSelectionCountLabel: true,
    hideDeleteButton: true,
    hideDuplicateButton: true,
    hideSettingsMenu: true,
    relativePosition: "top-left",
    visualScale: "s",
    label: "Draw a rectangular AOI",
  });
  const events = new AbortController();
  let editing = false;
  let cancelling = false;
  let drawing = false;
  let aoi = null;

  function publish(message) {
    onState({ drawing, aoi, message });
  }

  function syncControls() {
    component.hidden = !editing;
    component.inert = !editing || cancelling;
  }

  function setDrawing(value) {
    if (drawing === value) return;
    drawing = value;
    publish();
  }

  function finish(message) {
    drawing = false;
    clearSketch();
    publish(message);
  }

  function cancel() {
    if (cancelling || (!drawing && component.activeTool !== "rectangle")) return;
    cancelling = true;
    syncControls();
    void Promise.resolve()
      .then(() => {
        if (!events.signal.aborted) return component.cancel();
      })
      .catch(() => {
        if (!events.signal.aborted) finish("The drawing tool could not be cancelled.");
      })
      .finally(() => {
        if (events.signal.aborted) return;
        cancelling = false;
        clearSketch();
        syncControls();
      });
  }

  component.addEventListener(
    "arcgisPropertyChange",
    ({ detail }) => {
      if (!editing || cancelling || detail?.name !== "activeTool") return;
      setDrawing(component.activeTool === "rectangle");
    },
    { signal: events.signal }
  );
  component.addEventListener(
    "arcgisCreate",
    ({ detail }) => {
      if (!editing || cancelling) {
        clearSketch();
        return;
      }
      if (detail?.state === "cancel") {
        finish();
        return;
      }
      if (detail?.tool !== "rectangle") return;
      if (detail.state === "complete") {
        try {
          aoi = acceptGeometry(detail.graphic?.geometry);
          finish();
        } catch (error) {
          // Replacement uses a separate layer, so invalid geometry leaves the draft intact.
          finish(error.message);
        }
      } else {
        setDrawing(true);
      }
    },
    { signal: events.signal }
  );

  syncControls();
  host.append(component);
  return {
    ready: component.componentOnReady(),
    setEditing(value) {
      if (editing === value) return;
      editing = value;
      syncControls();
      if (!editing) {
        cancel();
        setDrawing(false);
      }
    },
    clear() {
      cancel();
      aoi = null;
      clearDraft();
      finish();
    },
    async destroy() {
      events.abort();
      component.remove();
      await component.destroy();
    },
  };
}
