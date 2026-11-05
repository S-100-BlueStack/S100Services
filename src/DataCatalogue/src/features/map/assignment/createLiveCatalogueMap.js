import { createBaseMapView } from "../core/createBaseMapView.js";
import { createPackageGeometrySource } from "../packages/createPackageGeometrySource.js";
import { createPackageGraphics } from "../packages/createPackageGraphics.js";
import {
  createPackageGeometryOverlay,
  packageGeometryMessage,
} from "../packages/createPackageGeometryOverlay.js";
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
  let selectedPackageId = null;
  let packageMapError = "";
  let packageState = { status: "empty", hasGeometry: false, detailCount: 0 };
  let geometryState = { status: "empty", count: 0, total: 0, failures: [] };
  function publish() {
    if (!alive) return;
    onStatus(
      [
        contextError,
        selected
          ? "Showing the selected Package geometry and Workspaces from saved bindings."
          : "Select a Package to display its AOI and saved intersecting Workspaces.",
        selected ? packageGeometryMessage(packageState) : "",
        selected && !geometryState.total ? "No saved intersecting Workspaces to display." : "",
        packageMapError,
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
  const packageOverlay = createPackageGeometryOverlay({
    source: createPackageGeometrySource({ catalogue }),
    renderer: createPackageGraphics({
      map,
      view,
      id: "data-catalogue-assignment-package",
    }),
    onStatus(state) {
      packageState = state;
      publish();
    },
  });
  const errors = view.on("layerview-create-error", ({ layer }) => {
    if (layer?.id === "data-catalogue-assignment-workspaces") {
      mapError =
        "Workspace rendering failed. Retry map; Package lists and binding operations remain available.";
    } else if (layer?.id === "data-catalogue-assignment-package") {
      packageMapError = "Package geometry rendering failed. Retry map to recover.";
    } else return;
    publish();
  });
  const recovered = view.on("layerview-create", ({ layer }) => {
    if (layer?.id === "data-catalogue-assignment-workspaces") mapError = "";
    else if (layer?.id === "data-catalogue-assignment-package") packageMapError = "";
    else return;
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
      const nextId = feature?.packageId ?? feature?.id ?? null;
      if (selectedPackageId !== nextId) {
        selectedPackageId = nextId;
        const pendingId = nextId;
        void packageOverlay.setPackage(nextId, { autoFocus: Boolean(nextId) }).then((state) => {
          if (alive && selectedPackageId === pendingId && nextId && !state.hasGeometry) {
            // The Package can legitimately have no AOI. Saved Workspace coverage remains focusable.
            void overlay.focus();
          }
        });
      }
      try {
        const context = liveAssignmentMapContext(feature, record);
        void overlay.setContext(context, { autoFocus: false });
      } catch (error) {
        void overlay.setContext();
        contextError = error.message;
      }
      publish();
    },
    async focus() {
      if (packageOverlay.getState().status === "loading") {
        // Queue focus for the new Package instead of flying to stale Workspace coverage.
        void packageOverlay.focus();
        return;
      }
      if (await packageOverlay.focus()) return;
      await overlay.focus();
    },
    destroy() {
      alive = false;
      errors.remove();
      recovered.remove();
      packageOverlay.destroy();
      overlay.destroy();
      detachBasemap();
      view.destroy();
    },
  };
}
