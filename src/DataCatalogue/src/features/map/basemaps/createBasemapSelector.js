// Keep the existing MapView architecture. ArcGIS Expand and Basemap Gallery
// connect through their public `view` properties, without an arcgis-map migration.
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

  function renderSelection(value) {
    currentSelection = value;
    const basemap = ui?.basemapsById.get(value);
    if (basemap && ui.gallery.activeBasemap !== basemap) {
      ui.gallery.activeBasemap = basemap;
    }
  }

  const unsubscribe = settings.subscribe(renderSelection);

  async function mount(view, token) {
    imports ??= loadModules();
    let modules;
    try {
      modules = await imports;
    } catch {
      if (alive && token === generation) {
        container.textContent =
          "Basemap gallery unavailable. Verify @arcgis/map-components installation.";
      }
      imports = null;
      return;
    }
    if (!alive || token !== generation || !view) return;
    const Basemap = modules[2].default;
    const LocalBasemapsSource = modules[3].default;
    const expand = document.createElement("arcgis-expand");
    expand.className = "dc-basemap-expand";
    expand.expandIcon = "basemap";
    expand.expandTooltip = "Choose basemap";
    expand.collapseTooltip = "Close basemaps";
    expand.label = "Basemaps";
    expand.mode = "floating";
    expand.visualScale = "s";

    const gallery = document.createElement("arcgis-basemap-gallery");
    gallery.className = "dc-basemap-gallery";
    gallery.label = "Basemaps";
    gallery.headingLevel = 3;
    expand.append(gallery);

    // Offer all available light/dark choices, independent of the UI theme.
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
      if (!alive || event.detail?.name !== "activeBasemap") return;
      const selected = gallery.activeBasemap;
      const id = typeof selected === "string" ? selected : (selected?.id ?? selected?.style?.id);
      if (!basemapsById.has(id)) return;
      // Programmatic changes (theme changes and shared-map sync) are not manual overrides.
      if (id === settings.getValue()) return;
      if (settings.setValue(id)) expand.expanded = false;
    };
    gallery.addEventListener("arcgisPropertyChange", onGalleryChanged);
    gallery.view = view;
    expand.view = view;
    container.replaceChildren(expand);
    ui = { expand, gallery, basemapsById, onGalleryChanged };
    renderSelection(currentSelection);
  }

  return {
    setView(view) {
      if (!alive || currentView === view) return;
      currentView = view ?? null;
      const token = ++generation;
      if (ui) {
        ui.gallery.view = currentView;
        ui.expand.view = currentView;
        return;
      }
      if (currentView) void mount(currentView, token);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      generation++;
      unsubscribe();
      if (ui) {
        ui.gallery.removeEventListener("arcgisPropertyChange", ui.onGalleryChanged);
        ui.gallery.view = null;
        ui.expand.view = null;
        const expand = ui.expand;
        expand.remove();
        void expand.destroy?.();
      }
      ui = null;
      container.replaceChildren();
    },
  };
}
