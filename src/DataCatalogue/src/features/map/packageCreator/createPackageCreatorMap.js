import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createBaseMapView } from "../core/createBaseMapView.js";
import { createPackageGeometrySource } from "../packages/createPackageGeometrySource.js";
import { createPackageGraphics } from "../packages/createPackageGraphics.js";
import { createPackageGeometryOverlay } from "../packages/createPackageGeometryOverlay.js";
import { createAoiSketch } from "./createAoiSketch.js";
import { loadAoiGeometry } from "./loadAoiGeometry.js";

const DRAFT_SYMBOL = {
  type: "simple-fill",
  color: [0, 122, 194, 0.15],
  outline: { color: [0, 122, 194, 1], width: 2 },
};

export function createPackageCreatorMap({
  container,
  sketchHost,
  runtimeConfig,
  catalogue,
  basemapSettings,
  onReady,
  onSketchState,
  onPreviewState,
}) {
  const sketchLayer = new GraphicsLayer({ title: "Draft AOI areas", popupEnabled: false });
  const { map, view, detachBasemap } = createBaseMapView({
    container,
    runtimeConfig,
    basemapSettings,
    layers: [sketchLayer],
    positionSlot: "packageCreator",
    viewOptions: { popup: null, popupEnabled: false },
  });
  view.ui.move("zoom", "top-right");
  let alive = true;
  let editing = false;
  let sketch;
  let sketchReady = false;

  async function mountSketch() {
    await Promise.all([import("@arcgis/map-components/components/arcgis-sketch"), view.when()]);
    if (!alive) return;
    const [geometry] = await Promise.all([
      loadAoiGeometry({ isWebMercator: view.spatialReference?.isWebMercator }),
      customElements.whenDefined("arcgis-sketch"),
    ]);
    if (!alive) return;
    const component = document.createElement("arcgis-sketch");
    sketch = createAoiSketch({
      component,
      host: sketchHost,
      view,
      layer: sketchLayer,
      symbol: DRAFT_SYMBOL,
      geometry,
      onState: onSketchState,
    });
    await sketch.ready;
    if (!alive) return;
    sketchReady = true;
    sketch.setEditing(editing);
    onReady(true);
  }
  const overlay = createPackageGeometryOverlay({
    source: createPackageGeometrySource({ catalogue }),
    renderer: createPackageGraphics({ map, view, id: "data-catalogue-created-package" }),
    onStatus: onPreviewState,
  });
  void mountSketch().catch(() => {
    if (alive) onReady(false, "Map drawing tools are unavailable. Check ArcGIS assets and WebGL.");
  });

  return {
    view,
    setEditing(value) {
      editing = value;
      if (sketchReady) sketch.setEditing(value);
    },
    clear: () => sketch?.clear(),
    showPackage: (id, { reload = false } = {}) =>
      overlay.setPackage(id, { reload, autoFocus: Boolean(id) }),
    async focus() {
      const areas = sketch?.getAreas() ?? [];
      if (!areas.length) return overlay.focus();
      try {
        await view.goTo(areas, { animate: false });
        return true;
      } catch {
        return false;
      }
    },
    destroy() {
      alive = false;
      overlay.destroy();
      detachBasemap();
      // The component releases its own view handles before the feature destroys the view.
      void Promise.resolve(sketch?.destroy())
        .catch(() => {})
        .finally(() => view.destroy());
    },
  };
}
