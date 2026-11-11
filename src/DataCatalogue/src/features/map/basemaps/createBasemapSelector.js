// Use Esri's gallery directly. Its public `view` property supports the existing
// MapView architecture without introducing an arcgis-map component.
async function loadBasemapModules() {
  return Promise.all([
    import("@arcgis/map-components/components/arcgis-basemap-gallery"),
    import("@arcgis/map-components/components/arcgis-expand"),
    import("@arcgis/core/Basemap.js"),
    import("@arcgis/core/basemapGallery/LocalBasemapsSource.js"),
  ]);
}

function basemapId(basemap) {
  return typeof basemap === "string" ? basemap : (basemap?.id ?? basemap?.style?.id);
}

export function createBasemapSelector({ container, settings, loadModules = loadBasemapModules }) {
  let alive = true;
  let generation = 0;
  let currentView = null;
  let ui = null;
  let modulesPromise = null;
  let currentSelection = settings.getValue();

  function syncSelection() {
    if (!ui?.ready) return;
    const candidate = ui.basemapsById.get(currentSelection);
    if (candidate && basemapId(ui.gallery.activeBasemap) !== currentSelection) {
      ui.gallery.activeBasemap = candidate;
    }
  }

  function refreshOptions() {
    if (!ui) return;
    const options = settings.getOptions();
    const nextIds = options.map((option) => option.id).join("|");
    if (nextIds === ui.optionIds) return;
    ui.optionIds = nextIds;
    ui.basemapsById.clear();
    for (const option of options) {
      const basemap =
        ui.Basemap.fromId(option.id) ?? new ui.Basemap({ id: option.id, style: { id: option.id } });
      basemap.title = option.label;
      ui.basemapsById.set(option.id, basemap);
    }
    const source = new ui.LocalBasemapsSource({ basemaps: [...ui.basemapsById.values()] });
    ui.sources.push(source);
    ui.gallery.source = source;
    syncSelection();
  }

  const unsubscribe = settings.subscribe((value) => {
    currentSelection = value;
    refreshOptions();
    syncSelection();
  });

  function disposeUi() {
    const previous = ui;
    ui = null;
    if (!previous) return;
    previous.gallery.removeEventListener("arcgisPropertyChange", previous.onSelection);
    previous.gallery.removeEventListener("arcgisReady", previous.onReady);
    previous.expand.remove();
    // Both components opted out of auto-destroy because MapView.ui reparents
    // their host. Explicit teardown owns their lifetime.
    void Promise.resolve()
      .then(() => previous.gallery.destroy?.())
      .catch(() => {})
      .finally(() => {
        for (const source of previous.sources) source.destroy?.();
      });
    void Promise.resolve()
      .then(() => previous.expand.destroy?.())
      .catch(() => {});
  }

  async function mount(view, token) {
    modulesPromise ??= loadModules();
    let modules;
    try {
      modules = await modulesPromise;
      // A defined custom element receives property values through its actual
      // setters. Assigning them to an unupgraded element loses the connection
      // when its component class is subsequently initialized.
      if (globalThis.customElements?.whenDefined) {
        await Promise.all([
          globalThis.customElements.whenDefined("arcgis-basemap-gallery"),
          globalThis.customElements.whenDefined("arcgis-expand"),
        ]);
      }
    } catch {
      modulesPromise = null;
      if (alive && token === generation) {
        container.textContent = "Basemap gallery is unavailable.";
      }
      return;
    }
    if (!alive || token !== generation || currentView !== view) return;

    const Basemap = modules[2].default;
    const LocalBasemapsSource = modules[3].default;
    const expand = document.createElement("arcgis-expand");
    expand.className = "dc-basemap-expand";
    expand.expandIcon = "basemap";
    expand.expandTooltip = "Choose basemap";
    expand.collapseTooltip = "Close basemaps";
    expand.label = "Basemaps";
    expand.mode = "floating";
    expand.visualScale = "m";
    expand.autoDestroyDisabled = true;

    const gallery = document.createElement("arcgis-basemap-gallery");
    gallery.className = "dc-basemap-gallery";
    gallery.label = "Basemaps";
    gallery.headingLevel = 3;
    gallery.autoDestroyDisabled = true;

    const mounted = {
      expand,
      gallery,
      Basemap,
      LocalBasemapsSource,
      basemapsById: new Map(),
      sources: [],
      optionIds: "",
      ready: false,
      onReady: null,
      onSelection: null,
    };
    mounted.onReady = () => {
      if (!alive || token !== generation || ui !== mounted) return;
      mounted.ready = true;
      syncSelection();
    };
    mounted.onSelection = (event) => {
      if (!alive || token !== generation || ui !== mounted) return;
      if (event.detail?.name !== "activeBasemap") return;
      const id = basemapId(gallery.activeBasemap);
      if (!mounted.basemapsById.has(id) || id === settings.getValue()) return;
      if (settings.setValue(id)) expand.expanded = false;
    };
    gallery.addEventListener("arcgisReady", mounted.onReady);
    gallery.addEventListener("arcgisPropertyChange", mounted.onSelection);
    ui = mounted;
    refreshOptions();

    // Set a fully upgraded component's source and view before connecting it.
    // This avoids a first render with an uninitialized gallery model.
    gallery.view = view;
    expand.view = view;
    expand.append(gallery);
    container.replaceChildren(expand);
    Promise.resolve(gallery.componentOnReady?.()).catch(() => {
      if (alive && token === generation && ui === mounted) {
        container.textContent = "Basemap gallery is unavailable.";
        disposeUi();
      }
    });
  }

  return {
    setView(view) {
      if (!alive || currentView === view) return;
      const oldView = currentView;
      const token = ++generation;
      oldView?.ui?.remove?.(container);
      disposeUi();
      currentView = view ?? null;
      container.replaceChildren();
      if (currentView?.ui?.add) {
        currentView.ui.add(container, { position: "top-right", index: 1 });
        void mount(currentView, token);
      }
    },
    destroy() {
      if (!alive) return;
      alive = false;
      generation++;
      currentView?.ui?.remove?.(container);
      currentView = null;
      unsubscribe();
      disposeUi();
      container.replaceChildren();
    },
  };
}
