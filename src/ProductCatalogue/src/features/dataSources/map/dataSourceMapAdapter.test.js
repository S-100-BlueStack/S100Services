import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { createDataSourceMapAdapter } from "./dataSourceMapAdapter.js";

function createMap() {
  const layers = [];
  return {
    layers,
    add(layer) {
      layers.push(layer);
    },
    remove(layer) {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
    },
  };
}

function createLayerRegistry({ throwOnRegister = null } = {}) {
  const layers = new Map();
  return {
    registerLayer(layer) {
      if (throwOnRegister?.(layer)) throw new Error("registry failure");
      layers.set(layer.customId, layer);
    },
    unregisterLayer(layer) {
      if (layers.get(layer.customId) !== layer) return false;
      return layers.delete(layer.customId);
    },
    getLayer(layerId) {
      return layers.get(layerId);
    },
  };
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
    graphics: [graphic],
    visible: true,
    destroyed: false,
    removeAll() {
      this.graphics = [];
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function createNormalized(source, productKey = "P001") {
  const identity = JSON.stringify([source.id, productKey]);
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
              datasetName: productKey,
              productIdentityKey: identity,
            },
            geometry: { type: "Point", coordinates: [12, 56] },
          },
        ],
      },
    })),
  };
}

const source = createDataSourceRegistry({ isDevelopment: true }).byId.get("paper-charts");

test("candidate preparation stays off the real map and commit publishes atomically", async () => {
  const map = createMap();
  const registry = createLayerRegistry();
  let stagingAdds = 0;
  const adapter = createDataSourceMapAdapter({
    map,
    layerRegistry: registry,
    createLayer: async (stagingMap, config) => {
      stagingMap.add({});
      stagingAdds += 1;
      return createFakeLayer(config);
    },
  });

  const candidate = await adapter.prepareSource({
    source,
    normalized: createNormalized(source),
    generation: 1,
  });

  assert.equal(stagingAdds, 1);
  assert.equal(map.layers.length, 0);
  assert.equal(candidate.layers[0].visible, false);

  const result = adapter.commitSource(candidate, { isCurrent: () => true });
  assert.equal(result.committed, true);
  assert.equal(map.layers.length, 1);
  assert.equal(map.layers[0].visible, true);
  assert.equal(adapter.isSourceRendered(source.id), true);
});

test("stale candidate never enters map or registry and is cleaned up", async () => {
  const map = createMap();
  const registry = createLayerRegistry();
  const adapter = createDataSourceMapAdapter({
    map,
    layerRegistry: registry,
    createLayer: async (_stagingMap, config) => createFakeLayer(config),
  });
  const candidate = await adapter.prepareSource({
    source,
    normalized: createNormalized(source),
    generation: 1,
  });
  const layer = candidate.layers[0];

  const result = adapter.commitSource(candidate, { isCurrent: () => false });
  assert.deepEqual(result, { committed: false, reason: "stale-candidate" });
  assert.equal(adapter.discardCandidate(candidate), true);
  assert.equal(layer.destroyed, true);
  assert.equal(map.layers.length, 0);
  assert.equal(registry.getLayer(layer.customId), undefined);
});

test("reactivation replaces rather than duplicates source layers and graphics", async () => {
  const map = createMap();
  const registry = createLayerRegistry();
  const adapter = createDataSourceMapAdapter({
    map,
    layerRegistry: registry,
    createLayer: async (_stagingMap, config) => createFakeLayer(config),
  });

  const first = await adapter.prepareSource({
    source,
    normalized: createNormalized(source, "P001"),
    generation: 1,
  });
  adapter.commitSource(first, { isCurrent: () => true });
  const firstLayer = map.layers[0];

  const second = await adapter.prepareSource({
    source,
    normalized: createNormalized(source, "P002"),
    generation: 2,
  });
  adapter.commitSource(second, { isCurrent: () => true });

  assert.equal(map.layers.length, 1);
  assert.equal(adapter.getSourceLayers(source.id).length, 1);
  assert.equal(firstLayer.destroyed, true);
  assert.equal(map.layers[0].graphics.length, 1);
  assert.equal(map.layers[0].graphics[0].attributes.productIdentityKey, '["paper-charts","P002"]');
});

test("commit failure rolls back candidate and preserves previous representation", async () => {
  const map = createMap();
  let failRegistration = false;
  const registry = createLayerRegistry({
    throwOnRegister: (layer) =>
      failRegistration &&
      layer.graphics?.[0]?.attributes?.productIdentityKey === '["paper-charts","P002"]',
  });
  const adapter = createDataSourceMapAdapter({
    map,
    layerRegistry: registry,
    createLayer: async (_stagingMap, config) => createFakeLayer(config),
  });

  const first = await adapter.prepareSource({
    source,
    normalized: createNormalized(source, "P001"),
    generation: 1,
  });
  adapter.commitSource(first, { isCurrent: () => true });
  const previousLayer = map.layers[0];

  failRegistration = true;
  const second = await adapter.prepareSource({
    source,
    normalized: createNormalized(source, "P002"),
    generation: 2,
  });
  const candidateLayer = second.layers[0];

  assert.throws(() => adapter.commitSource(second, { isCurrent: () => true }), /registry failure/);
  assert.deepEqual(map.layers, [previousLayer]);
  assert.equal(previousLayer.destroyed, false);
  assert.equal(candidateLayer.destroyed, true);
});

test("candidate validation rejects missing or inconsistent source identity", async () => {
  const map = createMap();
  const adapter = createDataSourceMapAdapter({
    map,
    layerRegistry: createLayerRegistry(),
    createLayer: async (_stagingMap, config) => {
      const layer = createFakeLayer(config);
      layer.graphics[0].attributes.sourceId = "wrong-source";
      return layer;
    },
  });

  await assert.rejects(
    adapter.prepareSource({ source, normalized: createNormalized(source), generation: 1 }),
    /without source metadata/
  );
  assert.equal(map.layers.length, 0);
});
