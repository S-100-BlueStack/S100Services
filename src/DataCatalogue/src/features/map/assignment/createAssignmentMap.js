import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createBaseMapView } from "../core/createBaseMapView.js";
import { createDirectWorkStreamSource } from "./createDirectWorkStreamSource.js";
import { featureGraphicProperties } from "./assignmentMapModel.js";

export function createAssignmentMap({ container, runtimeConfig, workStreams, onStatus }) {
  const featureLayer = new GraphicsLayer({
    id: "data-catalogue-assignment-feature",
    title: "Selected Feature",
    popupEnabled: false,
  });
  const { map, view } = createBaseMapView({
    container,
    runtimeConfig,
    layers: [featureLayer],
    viewOptions: { popup: null, popupEnabled: false },
  });

  let alive = true;
  let generation = 0;
  let currentId = null;
  let source = null;
  let assignedIds = [];
  let viewError = "";
  let geographyStatus = "";
  let selectionError = "";

  function publish() {
    if (alive) onStatus([viewError, selectionError, geographyStatus].filter(Boolean).join(" "));
  }

  function setGeographyStatus(message) {
    geographyStatus = message;
    publish();
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20000);
  const errors = view.on("layerview-create-error", () => {
    viewError = "Work stream rendering failed. Check the service, CORS and your ArcGIS session.";
    publish();
  });
  const ready = view
    .when()
    .then(() => true)
    .catch(() => {
      viewError = "Map could not start. Check basemap access and browser WebGL support.";
      publish();
      return false;
    });

  async function load() {
    setGeographyStatus("Loading live Work stream geography…");
    try {
      const bindings = await workStreams.mapBindings();
      if (!alive) return;

      source = createDirectWorkStreamSource({
        serviceUrl: runtimeConfig.workStreamMapServiceUrl,
        bindings,
      });
      map.addMany(
        source.entries.map((entry) => entry.layer),
        0
      );
      const results = await source.load({ signal: abort.signal });
      if (!alive) return;

      source.setAssigned(assignedIds);
      const failed = results.filter((result) => !result.ok);
      setGeographyStatus(
        failed.length
          ? `Work stream layers ${failed.map((result) => result.layerId).join(", ")} could not load. Check URL, CORS and ArcGIS session access. No substitute geography is shown.`
          : "Live Work stream geography loaded. Assignment does not require overlap."
      );
    } catch (error) {
      if (alive) setGeographyStatus(error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  void load();

  return {
    async selectFeature(feature) {
      const id = feature?.id ?? null;
      if (id === currentId) return;
      currentId = id;
      selectionError = "";
      publish();
      const current = ++generation;
      view.animation?.stop();
      featureLayer.removeAll();
      if (!feature) return;

      try {
        const graphic = new Graphic(featureGraphicProperties(feature));
        featureLayer.add(graphic);
        if (!(await ready) || !alive || current !== generation) return;
        await view.goTo({ target: graphic.geometry, zoom: 10 }, { animate: false });
      } catch (error) {
        if (alive && current === generation && error.name !== "AbortError") {
          selectionError = "Selected Feature could not be displayed.";
          publish();
        }
      }
    },
    setAssigned(ids) {
      assignedIds = [...ids];
      source?.setAssigned(ids);
    },
    destroy() {
      alive = false;
      generation++;
      abort.abort();
      clearTimeout(timeout);
      errors.remove();
      view.destroy();
      source?.destroy();
    },
  };
}
