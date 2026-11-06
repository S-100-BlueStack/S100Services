// The public Map Components `view` property keeps the existing MapView architecture.
async function loadBasemapModules() {
  return Promise.all([
    import("@arcgis/map-components/components/arcgis-basemap-gallery"),
    import("@arcgis/map-components/components/arcgis-expand"),
    import("@arcgis/core/Basemap.js"),
    import("@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js"),
  ]);
}

export function createBasemapSelector({ container, settings, loadModules = loadBasemapModules }) {
  let alive = true;
  let generation = 0;
  let currentView = null;
  let ui = null;
  let imports = null;
  let currentSelection = settings.getValue();
  let themeMode = settings.getThemeMode();
  let updatingSelection = false;
  container.style.colorScheme = themeMode;

  function renderSelection(id) {
    currentSelection = id;
    const basemap = ui?.basemapsById.get(id);
    if (!basemap || ui.gallery.activeBasemap === basemap) return;
    updatingSelection = true;
    try {
      ui.gallery.activeBasemap = basemap;
    } finally {
      updatingSelection = false;
    }
  }

  const unsubscribe = settings.subscribe(renderSelection);

  function releaseUi() {
    if (!ui) return;
    const previous = ui;
    ui = null;
    document.removeEventListener("pointerdown", previous.onOutsidePointerDown, { capture: true });
    previous.gallery.removeEventListener("arcgisPropertyChange", previous.onGalleryChanged);
    previous.gallery.view = null;
    previous.expand.view = null;
    previous.expand.remove();
    void Promise.resolve(previous.expand.destroy?.()).catch((error) => {
      console.warn("Failed to dispose the Basemap Gallery.", error);
    });
  }

  async function mount(view, token) {
    imports ??= loadModules();
    let modules;
    try {
      modules = await imports;
    } catch {
      if (alive && token === generation) {
        container.textContent = "Basemap gallery unavailable.";
      }
      imports = null;
      return;
    }
    if (!alive || token !== generation) return;

    const Basemap = modules[2].default;
    const LocalBasemapsSource = modules[3].default;
    const expand = document.createElement("arcgis-expand");
    expand.className = `pc-basemap-expand calcite-mode-${themeMode}`;
    expand.style.colorScheme = themeMode;
    expand.expandIcon = "basemap";
    expand.expandTooltip = "Choose basemap";
    expand.collapseTooltip = "Close basemaps";
    expand.label = "Basemaps";
    expand.mode = "floating";
    expand.visualScale = "m";

    const gallery = document.createElement("arcgis-basemap-gallery");
    gallery.className = `pc-basemap-gallery calcite-mode-${themeMode}`;
    gallery.style.colorScheme = themeMode;
    gallery.label = "Basemaps";
    gallery.headingLevel = 3;
    expand.append(gallery);

    const basemapsById = new Map(
      settings
        .getOptions()
        .map((entry) => [
          entry.id,
          Basemap.fromId(entry.id) ?? new Basemap({ id: entry.id, style: { id: entry.id } }),
        ])
    );
    gallery.source = new LocalBasemapsSource({ basemaps: [...basemapsById.values()] });

    const onGalleryChanged = (event) => {
      if (!alive || updatingSelection || event.detail?.name !== "activeBasemap") return;
      const selected = gallery.activeBasemap;
      const id = typeof selected === "string" ? selected : (selected?.id ?? selected?.style?.id);
      if (!basemapsById.has(id) || id === settings.getValue()) return;
      if (settings.setValue(id)) expand.expanded = false;
    };
    gallery.addEventListener("arcgisPropertyChange", onGalleryChanged);

    // The native Expand does not automatically collapse on clicks elsewhere.
    // The composed event path works for content hosted by public web components
    // without relying on their private shadow DOM or intercepting map clicks.
    const onOutsidePointerDown = (event) => {
      if (!expand.expanded) return;
      const path = event.composedPath?.() ?? [];
      if (
        path.includes(container) ||
        path.includes(expand) ||
        path.includes(gallery) ||
        container.contains?.(event.target) ||
        expand.contains?.(event.target) ||
        gallery.contains?.(event.target)
      ) {
        return;
      }
      expand.expanded = false;
    };
    document.addEventListener("pointerdown", onOutsidePointerDown, { capture: true });
    gallery.view = view;
    expand.view = view;
    container.replaceChildren(expand);
    ui = { expand, gallery, basemapsById, onGalleryChanged, onOutsidePointerDown };
    renderSelection(currentSelection);
  }

  return {
    setThemeMode(mode) {
      if (!alive) return;
      const nextMode = mode === "dark" ? "dark" : "light";
      if (nextMode === themeMode) return;
      themeMode = nextMode;
      container.style.colorScheme = nextMode;
      // Calcite 5.0 can keep the color tokens from the first rendered floating
      // Gallery panel. Recreate only this closed selector under the new mode;
      // its basemap state remains owned by settings and the MapView is retained.
      if (!ui) return;
      releaseUi();
      const token = ++generation;
      if (currentView) void mount(currentView, token);
      else container.replaceChildren();
    },
    setView(view) {
      if (!alive || currentView === view) return;
      currentView = view ?? null;
      const token = ++generation;
      if (ui) {
        ui.gallery.view = currentView;
        ui.expand.view = currentView;
      } else if (currentView) {
        void mount(currentView, token);
      }
    },
    close() {
      if (!alive || !ui?.expand?.expanded) return false;
      ui.expand.expanded = false;
      return true;
    },
    destroy() {
      if (!alive) return;
      alive = false;
      generation++;
      unsubscribe();
      releaseUi();
      container.replaceChildren();
    },
  };
}
