// The overview and coverage renderers remain the geometry owners. These local
// FeatureLayers supply native label placement/deconfliction without an API read.
export const MAP_LABEL_STYLES = Object.freeze({
  workspace: Object.freeze({ title: "Workspace labels", minScale: 5_000_000, size: 10 }),
  package: Object.freeze({ title: "Package labels", minScale: 3_000_000, size: 8 }),
  detailedPoint: Object.freeze({ title: "Detailed point labels", minScale: 0, size: 9 }),
});

function normalizeLabel(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sameEntries(previous, next) {
  return (
    previous.length === next.length &&
    previous.every(
      (entry, i) =>
        entry.id === next[i].id &&
        entry.text === next[i].text &&
        entry.geometry === next[i].geometry
    )
  );
}

export function createMapLabelLayers({ map, FeatureLayer, Graphic, kind }) {
  const style = MAP_LABEL_STYLES[kind];
  if (!style) throw new Error("Unsupported map label kind.");
  const isWorkspace = kind === "workspace";
  const isDetailedPoint = kind === "detailedPoint";
  let layers = [];
  let currentEntries = [];
  let alive = true;

  function clearLayers() {
    for (const layer of layers) {
      map.remove(layer);
      layer.destroy();
    }
    layers = [];
  }

  function replace(entries) {
    if (!alive) return;
    const next = [];
    const seen = new Set();
    for (const { id, text, geometry } of entries) {
      const label = normalizeLabel(text);
      if (!id || !label || !geometry?.spatialReference || seen.has(id)) continue;
      seen.add(id);
      next.push({ id, text: label, geometry });
    }
    if (sameEntries(currentEntries, next)) return;
    clearLayers();
    currentEntries = next;

    // A client-side FeatureLayer has one spatial reference. Keep the original
    // polygon reference for Workspaces, and use the rectangular AOI's center
    // for Packages so small AOIs can still receive a label outside their bounds.
    // Detailed point labels already have their exact projected point anchor.
    const groups = new Map();
    for (const entry of next) {
      try {
        const geometry =
          isWorkspace || isDetailedPoint ? entry.geometry : entry.geometry.extent?.center;
        if (!geometry?.spatialReference) continue;
        if (!isWorkspace && ![geometry.x, geometry.y].every(Number.isFinite)) continue;
        const spatialReference = geometry.spatialReference;
        const key = JSON.stringify(spatialReference.toJSON());
        if (!groups.has(key)) groups.set(key, { spatialReference, entries: [] });
        groups.get(key).entries.push({ geometry, text: entry.text });
      } catch (error) {
        console.warn(`${style.title} could not be prepared.`, error);
      }
    }
    for (const group of groups.values()) {
      let layer;
      try {
        layer = new FeatureLayer({
          title: style.title,
          source: group.entries.map(
            ({ geometry, text }, index) =>
              new Graphic({ geometry, attributes: { ObjectID: index + 1, labelText: text } })
          ),
          fields: [
            { name: "ObjectID", alias: "Object ID", type: "oid" },
            {
              name: "labelText",
              alias: "Label",
              type: "string",
              length: group.entries.reduce((length, { text }) => Math.max(length, text.length), 1),
            },
          ],
          objectIdField: "ObjectID",
          geometryType: isWorkspace ? "polygon" : "point",
          spatialReference: group.spatialReference,
          minScale: style.minScale,
          listMode: "hide",
          legendEnabled: false,
          popupEnabled: false,
          renderer: {
            type: "simple",
            symbol: {
              ...(isWorkspace
                ? { type: "simple-fill", style: "none" }
                : { type: "simple-marker", style: "circle", size: isDetailedPoint ? 8 : 1 }),
              color: [0, 0, 0, 0],
              outline: { color: [0, 0, 0, 0], width: 0 },
            },
          },
          labelsVisible: true,
          labelingInfo: [
            {
              labelExpressionInfo: { expression: "$feature.labelText" },
              labelPlacement: isWorkspace
                ? "always-horizontal"
                : isDetailedPoint
                  ? "below-center"
                  : "above-center",
              deconflictionStrategy: "static",
              symbol: {
                type: "text",
                color: isWorkspace || isDetailedPoint ? "#24303d" : "#174b75",
                haloColor: "#ffffff",
                haloSize: 1.5,
                font: { family: "Arial", size: style.size, weight: "bold" },
              },
            },
          ],
        });
        map.add(layer);
        layers.push(layer);
      } catch (error) {
        // Labels are optional presentation. A label-layer failure must not
        // invalidate the already published authoritative geometry or popup.
        if (layer) {
          map.remove(layer);
          layer.destroy();
        }
        console.warn(`${style.title} could not be initialized.`, error);
      }
    }
  }

  return {
    replace,
    clear() {
      if (!alive) return;
      currentEntries = [];
      clearLayers();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      currentEntries = [];
      clearLayers();
    },
  };
}
