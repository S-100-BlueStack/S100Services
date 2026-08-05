import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import {
  DATA_SOURCE_STORAGE_KEY,
  createDataSourcePersistence,
} from "../domain/dataSourcePersistence.js";
import { createDataSourceController } from "./dataSourceController.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createPersistence(enabledSourceIds = []) {
  const writes = [];
  return {
    writes,
    read() {
      return {
        status: "valid",
        enabledSourceIds: [...enabledSourceIds],
        shouldPersist: false,
        isFirstVisit: false,
      };
    },
    write(_registry, ids) {
      writes.push([...ids]);
      return true;
    },
  };
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
    readRaw(key) {
      return values.get(key) ?? null;
    },
  };
}

function createMapAdapter() {
  const rendered = new Map();
  const discarded = [];
  let candidateNumber = 0;
  return {
    rendered,
    discarded,
    async prepareSource({ source, generation, normalized }) {
      candidateNumber += 1;
      return {
        id: candidateNumber,
        sourceId: source.id,
        generation,
        normalized,
        layers: [{ id: `${source.id}-${candidateNumber}` }],
        committed: false,
        discarded: false,
      };
    },
    commitSource(candidate, { isCurrent }) {
      if (!isCurrent()) return { committed: false, reason: "stale-candidate" };
      rendered.set(candidate.sourceId, candidate);
      candidate.committed = true;
      return { committed: true, layers: candidate.layers, hoverReady: Promise.resolve() };
    },
    discardCandidate(candidate) {
      if (candidate.committed || candidate.discarded) return false;
      candidate.discarded = true;
      discarded.push(candidate);
      return true;
    },
    removeSource(sourceId) {
      return rendered.delete(sourceId) ? 1 : 0;
    },
    getSourceLayers(sourceId) {
      return rendered.get(sourceId)?.layers ?? [];
    },
  };
}

function createHarness({
  enabledSourceIds = [],
  loadSource,
  registry = createDataSourceRegistry({ isDevelopment: true }),
  persistence = createPersistence(enabledSourceIds),
} = {}) {
  const mapAdapter = createMapAdapter();
  const lifecycleEvents = [];
  const notices = [];
  const controller = createDataSourceController({
    registry,
    persistence,
    loadSource:
      loadSource ??
      (async (source) => ({
        sourceId: source.id,
        requestNumber: 1,
      })),
    normalizeSource: async (payload, source) => ({ payload, sourceId: source.id }),
    mapAdapter,
    lifecycle: {
      emit(name, detail) {
        lifecycleEvents.push({ name, detail });
      },
    },
    noticeError(...args) {
      notices.push(args);
    },
  });

  return { controller, registry, persistence, mapAdapter, lifecycleEvents, notices };
}

test("initialization restores exact persisted state and keeps sources independent", async () => {
  const harness = createHarness({ enabledSourceIds: ["s102"] });

  const result = await harness.controller.initialize();

  assert.equal(result.success, true);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["s102"]);
  assert.equal(harness.controller.getState("paper-charts").enabled, false);
  assert.equal(harness.controller.getState("s102").enabled, true);
  assert.deepEqual(harness.persistence.writes.at(-1), ["s102"]);
});

test("activation failure rolls back only the affected source", async () => {
  const harness = createHarness({
    enabledSourceIds: [],
    loadSource: async (source) => {
      if (source.id === "paper-charts") throw new Error("paper failure");
      return { sourceId: source.id };
    },
  });

  await harness.controller.activateSource("s102");
  const result = await harness.controller.activateSource("paper-charts");

  assert.equal(result.success, false);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["s102"]);
  assert.equal(harness.controller.getState("paper-charts").enabled, false);
  assert.equal(harness.mapAdapter.rendered.has("paper-charts"), false);
  assert.equal(harness.notices.length, 1);
});

test("failed refresh retains the last successful representation and enabled state", async () => {
  let request = 0;
  const harness = createHarness({
    loadSource: async () => {
      request += 1;
      if (request === 2) throw new Error("refresh failure");
      return { request };
    },
  });

  await harness.controller.activateSource("paper-charts");
  const previousCandidate = harness.mapAdapter.rendered.get("paper-charts");
  const result = await harness.controller.activateSource("paper-charts");

  assert.equal(result.success, false);
  assert.equal(result.retainedPreviousRepresentation, true);
  assert.equal(harness.controller.getState("paper-charts").enabled, true);
  assert.equal(harness.mapAdapter.rendered.get("paper-charts"), previousCandidate);
});

test("deactivation invalidates loading and prevents stale activation commit", async () => {
  const pending = deferred();
  const harness = createHarness({ loadSource: async () => pending.promise });

  const activation = harness.controller.activateSource("paper-charts");
  assert.equal(harness.controller.getState("paper-charts").loading, true);
  await harness.controller.deactivateSource("paper-charts");
  pending.resolve({ request: 1 });
  const activationResult = await activation;

  assert.equal(activationResult.stale, true);
  assert.equal(harness.controller.getState("paper-charts").enabled, false);
  assert.equal(harness.controller.getState("paper-charts").loading, false);
  assert.equal(harness.mapAdapter.rendered.has("paper-charts"), false);
});

test("refresh loads active sources only", async () => {
  const calls = [];
  const harness = createHarness({
    loadSource: async (source) => {
      calls.push(source.id);
      return { sourceId: source.id };
    },
  });

  await harness.controller.activateSource("s102");
  calls.length = 0;
  await harness.controller.refreshActive();

  assert.deepEqual(calls, ["s102"]);
});

test("reactivation always performs a fresh load", async () => {
  let requestCount = 0;
  const harness = createHarness({
    loadSource: async () => ({ request: ++requestCount }),
  });

  await harness.controller.activateSource("paper-charts");
  await harness.controller.deactivateSource("paper-charts");
  await harness.controller.activateSource("paper-charts");

  assert.equal(requestCount, 2);
  assert.equal(harness.controller.getState("paper-charts").enabled, true);
  assert.equal(harness.mapAdapter.rendered.size, 1);
});

test("stale refresh after disable and reactivation cannot overwrite newer data", async () => {
  const secondRequest = deferred();
  let requestCount = 0;
  const harness = createHarness({
    loadSource: async () => {
      requestCount += 1;
      if (requestCount === 2) return secondRequest.promise;
      return { request: requestCount };
    },
  });

  await harness.controller.activateSource("paper-charts");
  const staleRefresh = harness.controller.activateSource("paper-charts");
  await harness.controller.deactivateSource("paper-charts");
  const reactivation = await harness.controller.activateSource("paper-charts");
  const currentCandidate = harness.mapAdapter.rendered.get("paper-charts");
  secondRequest.resolve({ request: 2 });
  const staleResult = await staleRefresh;

  assert.equal(reactivation.success, true);
  assert.equal(staleResult.stale, true);
  assert.equal(harness.mapAdapter.rendered.get("paper-charts"), currentCandidate);
  assert.equal(currentCandidate.normalized.payload.request, 3);
});

test("stale error after newer success does not alter active state or publish notice", async () => {
  const staleRequest = deferred();
  let requestCount = 0;
  const harness = createHarness({
    loadSource: async () => {
      requestCount += 1;
      return requestCount === 1 ? staleRequest.promise : { request: requestCount };
    },
  });

  const firstActivation = harness.controller.activateSource("paper-charts");
  const secondActivation = await harness.controller.activateSource("paper-charts");
  staleRequest.reject(new Error("stale failure"));
  const staleResult = await firstActivation;

  assert.equal(secondActivation.success, true);
  assert.equal(staleResult.stale, true);
  assert.equal(harness.controller.getState("paper-charts").error, null);
  assert.equal(harness.notices.length, 0);
});

test("reset during loading invalidates old work and restores deployment defaults", async () => {
  const oldRequest = deferred();
  let paperCalls = 0;
  const harness = createHarness({
    loadSource: async (source) => {
      if (source.id === "paper-charts") {
        paperCalls += 1;
        if (paperCalls === 1) return oldRequest.promise;
      }
      return { sourceId: source.id, paperCalls };
    },
  });

  const oldActivation = harness.controller.activateSource("paper-charts");
  const resetResult = await harness.controller.resetToDefaults();
  oldRequest.resolve({ stale: true });
  const staleResult = await oldActivation;

  assert.equal(resetResult.success, true);
  assert.equal(staleResult.stale, true);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["paper-charts", "s102"]);
  assert.deepEqual(harness.persistence.writes.at(-1), ["paper-charts", "s102"]);
});

test("unavailable sources cannot be activated", async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.controller.activateSource("s57"),
    /not available in this deployment/
  );
  assert.equal(harness.mapAdapter.rendered.size, 0);
});

test("activation and refresh loading state remains source-local", async () => {
  const paperRequest = deferred();
  const harness = createHarness({
    loadSource: async (source) =>
      source.id === "paper-charts" ? paperRequest.promise : { sourceId: source.id },
  });

  const paperActivation = harness.controller.activateSource("paper-charts");
  const s102Activation = await harness.controller.activateSource("s102");

  assert.equal(s102Activation.success, true);
  assert.equal(harness.controller.getState("paper-charts").loading, true);
  assert.equal(harness.controller.getState("s102").loading, false);
  paperRequest.resolve({ sourceId: "paper-charts" });
  await paperActivation;
});

test("concurrent initialize calls share one initialization transaction", async () => {
  const pending = deferred();
  const calls = [];
  const harness = createHarness({
    enabledSourceIds: ["paper-charts", "s102"],
    loadSource: async (source) => {
      calls.push(source.id);
      await pending.promise;
      return { sourceId: source.id };
    },
  });

  const first = harness.controller.initialize();
  const second = harness.controller.initialize();

  assert.equal(first, second);
  assert.deepEqual(calls.sort(), ["paper-charts", "s102"]);

  pending.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, secondResult);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["paper-charts", "s102"]);
});

test("initialization preserves selected intent when a default source activation fails", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const harness = createHarness({
    registry,
    persistence,
    loadSource: async (source) => {
      if (source.id === "paper-charts") {
        throw new Error("Paper Charts unavailable");
      }
      return { sourceId: source.id };
    },
  });

  const result = await harness.controller.initialize();

  assert.equal(result.success, false);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["s102"]);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts", "s102"],
  });
});

test("reset preserves default intent when a source activation fails", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: [],
    }),
  });
  const persistence = createDataSourcePersistence({ storage });
  const harness = createHarness({
    registry,
    persistence,
    loadSource: async (source) => {
      if (source.id === "paper-charts") {
        throw new Error("Paper Charts unavailable");
      }
      return { sourceId: source.id };
    },
  });

  await harness.controller.initialize();
  const result = await harness.controller.resetToDefaults();

  assert.equal(result.success, false);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["s102"]);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts", "s102"],
  });
});

test("production initialization and resets do not create false initialized empty state", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const harness = createHarness({ registry, persistence });

  await harness.controller.initialize();
  await harness.controller.resetToDefaults({ reason: "local-reset" });
  await harness.controller.resetToDefaults({ reason: "global-preferences-reset" });

  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), null);
  assert.deepEqual(harness.controller.getActiveSourceIds(), []);
});

test("development first visit still activates and persists Paper Charts and S-102", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const harness = createHarness({ registry, persistence });

  const result = await harness.controller.initialize();

  assert.equal(result.success, true);
  assert.deepEqual(harness.controller.getActiveSourceIds(), ["paper-charts", "s102"]);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts", "s102"],
  });
});

test("production initialization preserves selection intent from a previous deployment", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: ["paper-charts", "s102"],
    }),
  });
  const original = storage.readRaw(DATA_SOURCE_STORAGE_KEY);
  const persistence = createDataSourcePersistence({ storage });
  const harness = createHarness({ registry, persistence });

  await harness.controller.initialize();
  await harness.controller.resetToDefaults({ reason: "local-reset" });

  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), original);
  assert.deepEqual(harness.controller.getActiveSourceIds(), []);
});
