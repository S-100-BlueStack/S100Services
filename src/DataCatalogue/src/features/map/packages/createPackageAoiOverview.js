import { loadPackageAois } from "./loadPackageAois.js";
import { createMapLabelLayers } from "../labels/createMapLabelLayers.js";

const LAYER_TITLE = "Assigned Package AOIs";

async function loadArcGisModules() {
  const [
    { default: GraphicsLayer },
    { default: Graphic },
    { default: Polygon },
    { default: FeatureLayer },
  ] = await Promise.all([
    import("@arcgis/core/layers/GraphicsLayer.js"),
    import("@arcgis/core/Graphic.js"),
    import("@arcgis/core/geometry/Polygon.js"),
    import("@arcgis/core/layers/FeatureLayer.js"),
  ]);
  return { GraphicsLayer, Graphic, Polygon, FeatureLayer };
}

// The Pipeline union comes from Work Scope. A Workspace filter only narrows
// the already loaded graphics; it cannot turn an unassigned Package into an AOI.
export function createPackageAoiOverview({
  catalogue,
  loadSdk = loadArcGisModules,
  onError = () => {},
} = {}) {
  let alive = true;
  let view = null;
  let layer = null;
  let labels = null;
  let allGraphics = [];
  let pipelineIds = [];
  let pipelineKey = "";
  let loadedPipelineKey = null;
  let visiblePackageIds = null;
  let generation = 0;
  let request = null;

  function abortPending() {
    generation++;
    request?.abort();
    request = null;
  }

  function removeLayer() {
    labels?.destroy();
    labels = null;
    if (view && layer) view.map?.remove?.(layer);
    layer?.destroy?.();
    layer = null;
    allGraphics = [];
    loadedPipelineKey = null;
  }

  function displayCurrentGraphics() {
    if (!layer || loadedPipelineKey !== pipelineKey) return;
    const visibleGraphics =
      visiblePackageIds === null
        ? allGraphics
        : allGraphics.filter((graphic) =>
            visiblePackageIds.has(graphic.attributes.overviewPackageId)
          );
    layer.removeAll();
    layer.addMany(visibleGraphics);
    layer.visible = true;
    labels?.replace(
      visibleGraphics.map(({ attributes, geometry }) => ({
        id: attributes.overviewPackageId,
        text: attributes.shortId,
        geometry,
      }))
    );
  }

  async function refresh() {
    if (!alive || !view || !pipelineIds.length) return;
    abortPending();
    const current = generation;
    const targetView = view;
    const targetKey = pipelineKey;
    const targetPipelines = [...pipelineIds];
    const controller = new AbortController();
    request = controller;
    const isCurrent = () =>
      alive &&
      view === targetView &&
      pipelineKey === targetKey &&
      generation === current &&
      !controller.signal.aborted;

    try {
      const { GraphicsLayer, Graphic, Polygon, FeatureLayer } = await loadSdk();
      if (!isCurrent()) return;
      const items = await loadPackageAois(catalogue, {
        pipelineIds: targetPipelines,
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      const graphics = items.map(
        (item) =>
          new Graphic({
            geometry: Polygon.fromJSON(item.aoi),
            attributes: { overviewPackageId: item.packageId, shortId: item.shortId },
            symbol: {
              type: "simple-fill",
              color: [28, 155, 218, 0.075],
              outline: { color: [10, 156, 218, 0.95], width: 1.1 },
            },
          })
      );
      if (!isCurrent()) return;
      if (!layer) {
        layer = new GraphicsLayer({ title: LAYER_TITLE, listMode: "hide" });
        // Keep background AOIs below selected Package and Workspace overlays.
        targetView.map.add(layer, 0);
        labels = createMapLabelLayers({
          map: targetView.map,
          FeatureLayer,
          Graphic,
          kind: "package",
        });
      }
      allGraphics = graphics;
      loadedPipelineKey = targetKey;
      displayCurrentGraphics();
    } catch (error) {
      if (!isCurrent()) return;
      // A failed same-scope refresh retains its last valid geometry. A changed
      // Pipeline union must never reveal graphics from the old selection.
      onError(error);
    } finally {
      if (request === controller) request = null;
    }
  }

  function setPipelineIds(nextPipelineIds, { reload = false } = {}) {
    if (!alive) return;
    const selected = Array.isArray(nextPipelineIds)
      ? [...new Set(nextPipelineIds.filter((id) => typeof id === "string" && id.trim()))].sort()
      : [];
    const nextKey = JSON.stringify(selected);
    if (nextKey === pipelineKey) {
      if (reload) void refresh();
      return;
    }
    abortPending();
    labels?.clear();
    pipelineIds = selected;
    pipelineKey = nextKey;
    if (layer) layer.visible = loadedPipelineKey === nextKey && selected.length > 0;
    if (!view || !selected.length) return;
    if (loadedPipelineKey === nextKey) displayCurrentGraphics();
    if (reload || loadedPipelineKey !== nextKey) void refresh();
  }

  return {
    refresh,
    setPipelineIds,
    // Preserve the previous single-Pipeline API for unchanged consumers/tests.
    setPipelineId(id) {
      setPipelineIds(id ? [id] : []);
    },
    setVisiblePackageIds(nextIds) {
      if (!alive) return;
      const next = nextIds === null ? null : new Set(Array.isArray(nextIds) ? nextIds : []);
      if (next === null && visiblePackageIds === null) return;
      if (
        next &&
        visiblePackageIds &&
        next.size === visiblePackageIds.size &&
        [...next].every((id) => visiblePackageIds.has(id))
      )
        return;
      visiblePackageIds = next;
      displayCurrentGraphics();
    },
    setView(nextView) {
      if (!alive || view === nextView) return;
      abortPending();
      removeLayer();
      view = nextView ?? null;
      if (view && pipelineIds.length) void refresh();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      abortPending();
      removeLayer();
      view = null;
    },
  };
}
