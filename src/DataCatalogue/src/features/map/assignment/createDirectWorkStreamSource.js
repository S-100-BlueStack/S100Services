import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import { layerBindings, mapServiceUrl, workStreamRenderer } from "./assignmentMapModel.js";

// Replace this source with backend-mediated geography later; authentication is SDK/session-owned.
export function createDirectWorkStreamSource({ serviceUrl, bindings }) {
  const base = mapServiceUrl(serviceUrl);
  const entries = layerBindings(bindings).map((binding) => ({
    ...binding,
    layer: new FeatureLayer({
      id: `data-catalogue-assignment-work-stream-${binding.layerId}`,
      url: `${base}/${binding.layerId}`,
      title: binding.workStreamIds.join(", "),
      popupEnabled: false,
      editingEnabled: false,
      outFields: [],
      minScale: 0,
      maxScale: 0,
    }),
  }));

  return {
    entries,
    async load({ signal }) {
      return Promise.all(
        entries.map(async ({ layer, layerId }) => {
          try {
            await layer.load({ signal });
            if (
              !layer.spatialReference ||
              !(layer.spatialReference.wkid || layer.spatialReference.wkt) ||
              !layer.objectIdField ||
              !layer.fields?.length ||
              !layer.capabilities?.operations?.supportsQuery
            ) {
              throw new Error("Unsupported metadata");
            }

            layer.renderer = workStreamRenderer(layer.geometryType, false);
            const query = layer.createQuery();
            query.where = "1=1";
            query.num = 1;
            query.returnGeometry = true;
            query.outFields = [layer.objectIdField];
            const sample = await layer.queryFeatures(query, { signal });
            if (sample.features.some((feature) => !feature.geometry?.spatialReference)) {
              throw new Error("Missing geometry");
            }
            return { layerId, ok: true };
          } catch {
            layer.visible = false;
            return { layerId, ok: false };
          }
        })
      );
    },
    setAssigned(ids) {
      const selected = new Set(ids);
      for (const entry of entries) {
        if (entry.layer.loaded && entry.layer.visible) {
          entry.layer.renderer = workStreamRenderer(
            entry.layer.geometryType,
            entry.workStreamIds.some((id) => selected.has(id))
          );
        }
      }
    },
    destroy() {
      for (const entry of entries) entry.layer.destroy();
    },
  };
}
