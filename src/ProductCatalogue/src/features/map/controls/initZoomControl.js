async function loadZoomComponent() {
  await import("@arcgis/map-components/components/arcgis-zoom");
}

// Keep a usable Zoom control visible while the replacement loads. The installed
// ArcGIS/Calcite version can retain its first-render mode, so theme changes
// replace only the Zoom host rather than replacing MapView or its UI owner.
export function initZoomControl(
  view,
  { loadComponent = loadZoomComponent, themeMode = "light" } = {}
) {
  if (!view?.ui?.add || !view?.ui?.remove) {
    return { setThemeMode() {}, destroy() {} };
  }

  // The built-in control must share the replacement position while the
  // component loads or if its chunk fails. UI.move is a public MapView API.
  view.ui.move?.({ component: "zoom", position: "top-right", index: 0 });

  let alive = true;
  let mode = themeMode === "dark" ? "dark" : "light";
  let generation = 0;
  let activeZoom = null;
  let pendingZoom = null;
  let builtInZoomRemoved = false;
  let componentLoad = null;

  function releaseZoom(zoom) {
    if (!zoom) return;
    view.ui.remove(zoom);
    zoom.view = undefined;
    zoom.remove();
    void Promise.resolve(zoom.destroy?.()).catch((error) => {
      console.warn("Failed to dispose the Zoom component.", error);
    });
  }

  function ensureComponentLoaded() {
    componentLoad ??= Promise.resolve()
      .then(() => loadComponent())
      .catch((error) => {
        componentLoad = null;
        throw error;
      });
    return componentLoad;
  }

  async function mount(token) {
    let nextZoom = null;
    try {
      await ensureComponentLoaded();
      if (!alive || view.destroyed || token !== generation) return;

      nextZoom = document.createElement("arcgis-zoom");
      nextZoom.className = `pc-map-zoom calcite-mode-${mode}`;
      nextZoom.style.colorScheme = mode;
      nextZoom.visualScale = "m";
      nextZoom.view = view;
      // Stage the replacement outside the tab order until it is ready. The
      // current control remains usable during asynchronous component startup.
      nextZoom.hidden = true;
      pendingZoom = nextZoom;
      view.ui.add([{ component: nextZoom, position: "top-right", index: 0 }]);
      await nextZoom.componentOnReady?.();
      if (!alive || view.destroyed || token !== generation || pendingZoom !== nextZoom) return;

      if (!builtInZoomRemoved) {
        view.ui.remove("zoom");
        builtInZoomRemoved = true;
      }

      const previousZoom = activeZoom;
      activeZoom = nextZoom;
      pendingZoom = null;
      nextZoom.hidden = false;
      releaseZoom(previousZoom);
    } catch (error) {
      if (alive && !view.destroyed && token === generation) {
        console.warn("Unable to initialize Zoom component; retaining existing Zoom.", error);
      }
    } finally {
      if (nextZoom && pendingZoom === nextZoom) {
        pendingZoom = null;
        releaseZoom(nextZoom);
      }
    }
  }

  void mount(generation);

  return {
    setThemeMode(nextMode) {
      if (!alive) return;
      const normalized = nextMode === "dark" ? "dark" : "light";
      if (normalized === mode) return;
      mode = normalized;
      generation++;
      // Retire an unfinished host before it can publish an obsolete theme.
      const previousPending = pendingZoom;
      pendingZoom = null;
      releaseZoom(previousPending);
      void mount(generation);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      generation++;
      const previousPending = pendingZoom;
      pendingZoom = null;
      releaseZoom(previousPending);
      const previousActive = activeZoom;
      activeZoom = null;
      releaseZoom(previousActive);
    },
  };
}
