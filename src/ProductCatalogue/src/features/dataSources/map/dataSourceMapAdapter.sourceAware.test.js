import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { createDataSourceMapAdapter } from "./dataSourceMapAdapter.js";

if (!globalThis.document) {
  globalThis.document = new EventTarget();
}

function createFakeLayer(config) {
  const graphic = {
    attributes: {
      sourceId: config.data.features[0].properties.sourceId,
      productIdentityKey: config.data.features[0].properties.productIdentityKey,
    },
  };
  return {
    customId: config.id,
    appLayerCapabilities: config.capabilities,
    graphics: [graphic],
    visible: true,
    removeAll() {
      this.graphics = [];
    },
    destroy() {},
  };
}

function createNormalized(source) {
  return {
    layers: source.layerDefinitions.map((definition) => ({
      layerId: definition.id,
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              sourceId: source.id,
              datasetName: "P001",
              productIdentityKey: JSON.stringify([source.id, "P001"]),
            },
            geometry: { type: "Point", coordinates: [12, 56] },
          },
        ],
      },
    })),
  };
}

test("committed source layer carries registry metadata required by Product context", async () => {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get("paper-charts");
  const map = {
    layers: [],
    add(layer) {
      this.layers.push(layer);
    },
    remove(layer) {
      this.layers = this.layers.filter((candidate) => candidate !== layer);
    },
  };
  const registered = new Map();
  const adapter = createDataSourceMapAdapter({
    map,
    createLayer: async (_stagingMap, config) => createFakeLayer(config),
    layerRegistry: {
      registerLayer(layer) {
        registered.set(layer.customId, layer);
      },
      unregisterLayer(layer) {
        registered.delete(layer.customId);
      },
      getLayer(layerId) {
        return registered.get(layerId);
      },
    },
  });
  const candidate = await adapter.prepareSource({
    source,
    normalized: createNormalized(source),
    generation: 1,
  });
  adapter.commitSource(candidate, { isCurrent: () => true });
  const layer = map.layers[0];

  assert.equal(layer.appSourceDefinition, source);
  assert.equal(layer.appSourceId, source.id);
  assert.equal(layer.appSourceLabel, source.label);
  assert.equal(layer.appSourceCapabilities, source.capabilities);
  assert.equal(layer.appProductType, source.productType);
  assert.equal(layer.appExportConfiguration, source.exportConfiguration);
  assert.equal(layer.popupEnabled, true);
  assert.equal(typeof layer.popupTemplate.content, "function");
});
