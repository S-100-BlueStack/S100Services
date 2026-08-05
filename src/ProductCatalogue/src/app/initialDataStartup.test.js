import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../features/dataSources/config/dataSourceRegistry.js";
import {
  DATA_SOURCE_STORAGE_KEY,
  createDataSourcePersistence,
} from "../features/dataSources/domain/dataSourcePersistence.js";
import { createDataSourceController } from "../features/dataSources/services/dataSourceController.js";
import { runInitialDataStartup } from "./initialDataStartup.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    readJson(key) {
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    },
  };
}

function createController({ storage = createMemoryStorage(), loadSource } = {}) {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const persistence = createDataSourcePersistence({ storage });
  const committedLayerIds = new Set();
  const candidates = new Map();
  const controller = createDataSourceController({
    registry,
    persistence,
    loadSource: loadSource ?? (async (source) => ({ sourceId: source.id })),
    normalizeSource: async (payload, source) => ({ payload, sourceId: source.id }),
    mapAdapter: {
      async prepareSource({ source, normalized, generation }) {
        const candidate = {
          sourceId: source.id,
          generation,
          normalized,
          layers: source.layerDefinitions.map((definition) => ({ id: definition.id })),
        };
        candidates.set(source.id, candidate);
        return candidate;
      },
      commitSource(candidate, { isCurrent }) {
        if (!isCurrent()) {
          return { committed: false };
        }
        for (const layer of candidate.layers) {
          assert.equal(committedLayerIds.has(layer.id), false, `Duplicate layer ID: ${layer.id}`);
          committedLayerIds.add(layer.id);
        }
        return {
          committed: true,
          layers: candidate.layers,
          hoverReady: Promise.resolve(),
        };
      },
      discardCandidate() {},
      removeSource(sourceId) {
        const candidate = candidates.get(sourceId);
        for (const layer of candidate?.layers ?? []) {
          committedLayerIds.delete(layer.id);
        }
        candidates.delete(sourceId);
        return 0;
      },
      getSourceLayers(sourceId) {
        return candidates.get(sourceId)?.layers ?? [];
      },
    },
    lifecycle: { emit() {} },
  });

  return { controller, storage, committedLayerIds };
}

test("compatibility success initializes runtime sources exactly once", async () => {
  let compatibilityCalls = 0;
  let sourceInitializationCalls = 0;

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      compatibilityCalls += 1;
      return { rendered: true };
    },
    initializeRuntimeSources: async () => {
      sourceInitializationCalls += 1;
      return { initialized: true };
    },
  });

  assert.equal(result.compatibility.status, "fulfilled");
  assert.equal(result.runtimeSources.status, "fulfilled");
  assert.equal(compatibilityCalls, 1);
  assert.equal(sourceInitializationCalls, 1);
});

test("permanent compatibility failure still initializes runtime sources", async () => {
  let sourceInitializationCalls = 0;

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      throw new Error("AOI unavailable");
    },
    initializeRuntimeSources: async () => {
      sourceInitializationCalls += 1;
      return { initialized: true };
    },
  });

  assert.equal(result.compatibility.status, "rejected");
  assert.match(result.compatibility.reason.message, /AOI unavailable/);
  assert.equal(result.runtimeSources.status, "fulfilled");
  assert.equal(sourceInitializationCalls, 1);
});

test("runtime-source initialization failure does not block compatibility success", async () => {
  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => ({ rendered: true }),
    initializeRuntimeSources: async () => {
      throw new Error("source initialization failed");
    },
  });

  assert.equal(result.compatibility.status, "fulfilled");
  assert.deepEqual(result.compatibility.value, { rendered: true });
  assert.equal(result.runtimeSources.status, "rejected");
});

test("a failed runtime source activation does not turn successful compatibility startup into failure", async () => {
  const { controller } = createController({
    loadSource: async (source) => {
      if (source.id === "paper-charts") {
        throw new Error("Paper Charts unavailable");
      }
      return { sourceId: source.id };
    },
  });

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => ({ rendered: true }),
    initializeRuntimeSources: () => controller.initialize(),
  });

  assert.equal(result.compatibility.status, "fulfilled");
  assert.equal(result.runtimeSources.status, "fulfilled");
  assert.deepEqual(result.runtimeSources.value.failedSourceIds, ["paper-charts"]);
  assert.deepEqual(controller.getActiveSourceIds(), ["s102"]);
});

test("compatibility and runtime source initialization overlap without layer collisions", async () => {
  const compatibilityGate = deferred();
  const sourceGate = deferred();
  const events = [];
  const { controller, committedLayerIds } = createController({
    loadSource: async (source) => {
      events.push(`source-start:${source.id}`);
      await sourceGate.promise;
      return { sourceId: source.id };
    },
  });

  const startup = runInitialDataStartup({
    loadCompatibilityData: async () => {
      events.push("compatibility-start");
      await compatibilityGate.promise;
      assert.equal(committedLayerIds.has("product-corrections"), false);
      committedLayerIds.add("product-corrections");
      return { layerIds: ["product-corrections"] };
    },
    initializeRuntimeSources: () => controller.initialize(),
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(events.includes("compatibility-start"), true);
  assert.equal(events.includes("source-start:paper-charts"), true);
  assert.equal(events.includes("source-start:s102"), true);

  sourceGate.resolve();
  compatibilityGate.resolve();
  const result = await startup;

  assert.equal(result.compatibility.status, "fulfilled");
  assert.equal(result.runtimeSources.status, "fulfilled");
  assert.deepEqual([...committedLayerIds].sort(), [
    "paper-charts-products",
    "product-corrections",
    "s102-products",
  ]);
});

test("first-visit defaults apply even when compatibility loading fails", async () => {
  const { controller, storage, committedLayerIds } = createController();

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      throw new Error("AOI unavailable");
    },
    initializeRuntimeSources: () => controller.initialize(),
  });

  assert.equal(result.compatibility.status, "rejected");
  assert.deepEqual(controller.getActiveSourceIds(), ["paper-charts", "s102"]);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts", "s102"],
  });
  assert.deepEqual([...committedLayerIds].sort(), ["paper-charts-products", "s102-products"]);
});

test("persisted source selection restores even when compatibility loading fails", async () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: ["s102"],
    }),
  });
  const { controller, committedLayerIds } = createController({ storage });

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      throw new Error("AOI unavailable");
    },
    initializeRuntimeSources: () => controller.initialize(),
  });

  assert.equal(result.compatibility.status, "rejected");
  assert.deepEqual(controller.getActiveSourceIds(), ["s102"]);
  assert.deepEqual([...committedLayerIds], ["s102-products"]);
});

test("compatibility failure remains observable while independent source layers stay committed", async () => {
  const { controller, committedLayerIds } = createController();

  const result = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      throw new Error("permanent compatibility failure");
    },
    initializeRuntimeSources: () => controller.initialize(),
  });

  assert.equal(result.compatibility.status, "rejected");
  assert.equal(result.runtimeSources.status, "fulfilled");
  assert.deepEqual([...committedLayerIds].sort(), ["paper-charts-products", "s102-products"]);
});
