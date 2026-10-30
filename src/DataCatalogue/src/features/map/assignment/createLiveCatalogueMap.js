import { createBaseMapView } from "../core/createBaseMapView.js";
import { createWorkspaceGeometrySource } from "../workspaces/createWorkspaceGeometrySource.js";
import { createWorkspaceGraphics } from "../workspaces/createWorkspaceGraphics.js";
import {
  createWorkspaceOverlay,
  workspaceOverlayMessage,
} from "../workspaces/createWorkspaceOverlay.js";
import { liveAssignmentMapContext } from "./liveAssignmentMapContext.js";

export function createLiveCatalogueMap({
  container,
  runtimeConfig,
  catalogue,
  onStatus,
  basemapSettings,
}) {
  const { map, view, detachBasemap } = createBaseMapView({
    container,
    runtimeConfig,
    basemapSettings,
    positionSlot: "assignment",
    viewOptions: { popup: null, popupEnabled: false },
  });
  let alive = true;
  let selected = false;
  let mapError = "";
  let contextError = "";
  let geometryState = { status: "empty", count: 0, total: 0, failures: [] };
  function publish() {
    if (!alive) return;
    onStatus(
      [
        contextError,
        selected
          ? "Showing Workspaces from last loaded Package bindings. Package AOI coordinates are unavailable from the API."
          : "Select a Package to display its saved intersecting Workspaces.",
        selected && !geometryState.total ? "No saved intersecting Workspaces to display." : "",
        mapError || workspaceOverlayMessage(geometryState),
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  const overlay = createWorkspaceOverlay({
    source: createWorkspaceGeometrySource({ catalogue }),
    renderer: createWorkspaceGraphics({ map, view, id: "data-catalogue-assignment-workspaces" }),
    onStatus(state) {
      geometryState = state;
      publish();
    },
  });
  const errors = view.on("layerview-create-error", ({ layer }) => {
    if (layer?.id !== "data-catalogue-assignment-workspaces") return;
    mapError =
      "Workspace rendering failed. Retry map; Package lists and binding operations remain available.";
    publish();
  });
  void view.when().catch(() => {
    mapError =
      "Map could not start. Check basemap access and browser WebGL support. Lists and bindings remain available.";
    publish();
  });
  publish();
  return {
    view,
    selectContext(feature, record) {
      if (!alive) return;
      selected = Boolean(feature);
      contextError = "";
      try {
        const context = liveAssignmentMapContext(feature, record);
        void overlay.setContext(context);
      } catch (error) {
        void overlay.setContext();
        contextError = error.message;
      }
      publish();
    },
    focus: overlay.focus,
    destroy() {
      alive = false;
      errors.remove();
      overlay.destroy();
      detachBasemap();
      view.destroy();
    },
  };
}
