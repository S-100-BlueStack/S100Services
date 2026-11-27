const CREATE_TOOLS = ["rectangle", "polygon", "circle"];

export function createAoiSketch({ component, host, view, layer, symbol, geometry, onState }) {
  Object.assign(component, {
    view,
    layer,
    autoDestroyDisabled: true,
    defaultGraphicsLayerDisabled: true,
    availableCreateTools: [...CREATE_TOOLS],
    creationMode: "single",
    defaultUpdateOptions: { tool: "reshape", multipleSelectionEnabled: false },
    polygonSymbol: symbol,
    hideSelectionToolsLassoSelection: true,
    hideSelectionToolsRectangleSelection: true,
    hideDuplicateButton: true,
    hideSettingsMenu: true,
    toolbarKind: "floating",
    relativePosition: "bottom-left",
    layout: "horizontal",
    visualScale: "s",
    label: "Edit AOI areas",
  });

  const events = new AbortController();
  let editing = false;
  let cancelling = false;
  let operation = false;
  let accepted = new Map();
  let aoi = null;

  function busy() {
    return (
      operation ||
      cancelling ||
      Boolean(component.activeTool) ||
      Boolean(component.geometrySimplificationInProgress)
    );
  }

  function publish(message) {
    onState({ drawing: editing && busy(), aoi, count: accepted.size, message });
  }

  function syncControls() {
    component.hidden = !editing;
    component.inert = !editing || cancelling;
    component.updateOnGraphicClickDisabled = !editing || cancelling;
  }

  function restore() {
    // Keep the native graphic identities so selection and hit testing remain SDK-owned.
    for (const graphic of layer.graphics.toArray()) {
      if (!accepted.has(graphic)) layer.remove(graphic);
    }
    for (const [graphic, snapshot] of accepted) {
      graphic.geometry = snapshot.original.clone();
      if (!layer.graphics.includes(graphic)) layer.add(graphic);
    }
  }

  function cancel() {
    if (cancelling || !busy()) return;
    cancelling = true;
    syncControls();
    void Promise.resolve()
      .then(() => {
        if (!events.signal.aborted) return component.cancel();
      })
      .catch(() => {})
      .finally(() => {
        if (events.signal.aborted) return;
        operation = false;
        restore();
        cancelling = false;
        syncControls();
        publish();
      });
  }

  function commit(change) {
    operation = false;
    const next = new Map(accepted);
    let message;
    try {
      change(next);
      aoi = geometry.combine([...next.values()].map(({ polygon }) => polygon));
      accepted = next;
    } catch (error) {
      restore();
      message = `${error.message} The previous AOI was kept.`;
    }
    publish(message);
  }

  function save(graphic, next) {
    const original = graphic.geometry.clone();
    next.set(graphic, { original, polygon: geometry.prepare(original) });
  }

  function listen(name, callback) {
    component.addEventListener(
      name,
      ({ detail }) => {
        if (!editing || cancelling) {
          // Late SDK events must not change the accepted draft or its displayed areas.
          restore();
          return;
        }
        callback(detail);
      },
      { signal: events.signal }
    );
  }

  component.addEventListener(
    "arcgisPropertyChange",
    ({ detail }) => {
      if (
        editing &&
        (detail?.name === "activeTool" || detail?.name === "geometrySimplificationInProgress")
      ) {
        publish();
      }
    },
    { signal: events.signal }
  );
  listen("arcgisCreate", (detail) => {
    if (detail.state === "cancel") {
      operation = false;
      restore();
      publish();
    } else if (detail.state === "complete") {
      const { graphic, tool } = detail;
      commit((next) => {
        if (!graphic?.geometry || !CREATE_TOOLS.includes(tool)) {
          throw new Error("Draw a rectangle, polygon or circle.");
        }
        save(graphic, next);
        if (!layer.graphics.includes(graphic)) layer.add(graphic);
      });
    } else {
      operation = true;
      publish();
    }
  });
  listen("arcgisUpdate", (detail) => {
    if (detail.state !== "complete") {
      operation = true;
      publish();
    } else if (detail.aborted) {
      operation = false;
      restore();
      publish();
    } else {
      commit((next) => {
        for (const graphic of detail.graphics) {
          if (next.has(graphic) && layer.graphics.includes(graphic)) save(graphic, next);
        }
      });
    }
  });
  listen("arcgisDelete", ({ graphics }) => {
    commit((next) => {
      for (const graphic of graphics) next.delete(graphic);
    });
    restore();
  });

  syncControls();
  host.append(component);
  return {
    ready: component.componentOnReady(),
    setEditing(value) {
      if (editing === value) return;
      editing = value;
      if (!editing) cancel();
      syncControls();
    },
    getAreas: () => [...accepted.values()].map(({ original }) => original),
    clear() {
      cancel();
      operation = false;
      accepted.clear();
      layer.removeAll();
      aoi = null;
      publish();
    },
    async destroy() {
      events.abort();
      component.remove();
      await component.destroy();
    },
  };
}
