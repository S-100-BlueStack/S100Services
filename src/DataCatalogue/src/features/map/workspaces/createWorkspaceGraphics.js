import Graphic from "@arcgis/core/Graphic.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import CustomContent from "@arcgis/core/popup/content/CustomContent.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import * as simplifyOperator from "@arcgis/core/geometry/operators/simplifyOperator.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";
import { normalizeWorkspacePolygon } from "../../../shared/api/workspaceGeometry.js";
import { workspaceSelectionKey } from "./pipelineVisibility.js";
import { workspaceColorForOpenJobs } from "./workspaceJobColors.js";
import { createAssignmentWorkspaceSymbol } from "./workspaceCoverageSymbol.js";
import { createWorkspacePopup } from "../popups/workspacePopupContent.js";
import { createWorkspacePopupHeaderStyle } from "../popups/workspacePopupHeaderStyle.js";
import { createMapLabelLayers } from "../labels/createMapLabelLayers.js";

let projectionReady;
function loadProjection() {
  if (projectOperator.projectIsLoaded()) return Promise.resolve();
  // The SDK operator is process-wide; share only initialization, never Workspace data.
  projectionReady ??= projectOperator.projectLoad().catch((error) => {
    projectionReady = null;
    throw error;
  });
  return projectionReady;
}

export function createWorkspaceGraphics({ map, view, id, colorByOpenJobs = false }) {
  const layer = new GraphicsLayer({
    id,
    title: "Workspace coverage",
    popupEnabled: colorByOpenJobs,
  });
  const workspacePopup = colorByOpenJobs ? createWorkspacePopup({ CustomContent }) : null;
  const headerStyle = colorByOpenJobs
    ? createWorkspacePopupHeaderStyle({ view, layerId: id, watch: reactiveUtils.watch })
    : null;
  map.add(layer);
  const labels = colorByOpenJobs
    ? createMapLabelLayers({ map, FeatureLayer, Graphic, kind: "workspace" })
    : null;
  const ready = view.when().then(
    () => true,
    () => false
  );
  let alive = true;
  let counts = null;
  let currentEntries = [];
  let visibleKeys = null;
  const graphics = new Map();

  function openJobCount(workspace) {
    return counts ? (counts.get(workspaceSelectionKey(workspace)) ?? 0) : null;
  }

  function applySymbol(graphic, workspace) {
    if (colorByOpenJobs) {
      const openJobs = openJobCount(workspace);
      const color = workspaceColorForOpenJobs(openJobs);
      graphic.symbol = {
        type: "simple-fill",
        color: [...color, 0.12],
        outline: { color: [...color, 0.95], width: 2.3 },
      };
      graphic.attributes = {
        ...graphic.attributes,
        workspaceName: workspace.name,
        pipelineName: workspace.pipelineName,
        openJobs,
      };
    } else {
      graphic.symbol = createAssignmentWorkspaceSymbol();
    }
  }

  function syncLabels() {
    labels?.replace(
      currentEntries
        .filter(
          ({ workspace }) => !visibleKeys || visibleKeys.has(workspaceSelectionKey(workspace))
        )
        .map(({ workspace, geometry }) => ({
          id: workspaceSelectionKey(workspace),
          text: workspace.name,
          geometry,
        }))
    );
  }

  function publish() {
    if (!alive) return;
    const nextKeys = new Set();
    for (const { workspace, geometry } of currentEntries) {
      const key = workspaceSelectionKey(workspace);
      nextKeys.add(key);
      let graphic = graphics.get(key);
      if (!graphic) {
        graphic = new Graphic({
          geometry,
          attributes: { pipelineId: workspace.pipelineId, workspaceId: workspace.workspaceId },
          ...(workspacePopup ? { popupTemplate: workspacePopup.template } : {}),
        });
        graphics.set(key, graphic);
        layer.add(graphic);
      } else if (graphic.geometry !== geometry) {
        graphic.geometry = geometry;
      }
      graphic.visible = !visibleKeys || visibleKeys.has(key);
      applySymbol(graphic, workspace);
    }
    closeStaleWorkspacePopup(nextKeys);
    for (const [key, graphic] of graphics) {
      if (!nextKeys.has(key)) {
        layer.remove(graphic);
        graphics.delete(key);
      }
    }
    syncLabels();
    headerStyle?.refresh();
  }

  function closeStaleWorkspacePopup(validKeys = new Set(graphics.keys())) {
    if (!colorByOpenJobs) return;
    const selected = view.popup?.selectedFeature ?? view.popup?.viewModel?.selectedFeature;
    if (selected?.layer?.id !== id) return;
    const key = workspaceSelectionKey(selected.attributes ?? {});
    if (validKeys.has(key) && graphics.get(key)?.visible) return;
    if (typeof view.closePopup === "function") view.closePopup();
    else view.popup?.close?.();
  }

  return {
    async prepare(json) {
      if (!(await ready) || !alive) throw new Error("Workspace map is unavailable.");
      let polygon = Polygon.fromJSON(json);
      if (!polygon.spatialReference.equals(view.spatialReference)) {
        try {
          await loadProjection();
          if (!alive) throw new Error("Workspace map was closed.");
          polygon = projectOperator.projectExecute(polygon, view.spatialReference);
        } catch {
          throw new Error("Workspace spatial reference could not be projected to this map.");
        }
      }
      const extent = polygon?.extent;
      if (
        !polygon ||
        polygon.type !== "polygon" ||
        !extent ||
        ![extent.xmin, extent.ymin, extent.xmax, extent.ymax].every(Number.isFinite) ||
        extent.width <= 0 ||
        extent.height <= 0
      )
        throw new Error("Workspace polygon is empty or unsupported after projection.");
      normalizeWorkspacePolygon(JSON.stringify(polygon.toJSON()));
      if (!simplifyOperator.simplifyIsSimple(polygon))
        throw new Error("Workspace polygon is not topologically simple after projection.");
      return polygon;
    },
    clear() {
      if (alive) {
        closeStaleWorkspacePopup(new Set());
        currentEntries = [];
        graphics.clear();
        layer.removeAll();
        labels?.clear();
      }
    },
    replace(entries) {
      if (!alive) return;
      currentEntries = [...entries];
      publish();
    },
    setWorkspaceSummaries(workspaces) {
      workspacePopup?.setWorkspaces(workspaces);
    },
    setVisibleWorkspaces(workspaces) {
      if (!alive) return;
      visibleKeys = new Set(workspaces.map(workspaceSelectionKey));
      for (const [key, graphic] of graphics) graphic.visible = visibleKeys.has(key);
      closeStaleWorkspacePopup();
      syncLabels();
      headerStyle?.refresh();
    },
    setOpenJobCounts(nextCounts) {
      if (!alive || !colorByOpenJobs) return;
      counts = nextCounts;
      for (const { workspace } of currentEntries) {
        const graphic = graphics.get(workspaceSelectionKey(workspace));
        // A refresh also republishes counts. Leave popup attributes alone
        // when the effective count has not changed.
        if (graphic && graphic.attributes.openJobs !== openJobCount(workspace))
          applySymbol(graphic, workspace);
      }
      headerStyle?.refresh();
    },
    async focus(entries, { shouldApply = () => true } = {}) {
      if (!(await ready) || !alive || !shouldApply() || !entries.length) return;
      const extent = entries
        .slice(1)
        .reduce(
          (combined, entry) => combined.union(entry.geometry.extent),
          entries[0].geometry.extent.clone()
        );
      // Instant navigation also honors reduced motion and is canceled on context changes.
      await view.goTo(extent.expand(1.15), { animate: false });
    },
    stop() {
      if (alive) view.animation?.stop();
    },
    destroy() {
      closeStaleWorkspacePopup(new Set());
      alive = false;
      workspacePopup?.destroy();
      headerStyle?.destroy();
      labels?.destroy();
      map.remove(layer);
      layer.destroy();
    },
  };
}
