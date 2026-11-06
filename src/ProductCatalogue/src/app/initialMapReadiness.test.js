import assert from "node:assert/strict";
import test from "node:test";
import { waitForInitialMapReadiness } from "./initialMapReadiness.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createClock() {
  let now = 0;
  let nextId = 0;
  const tasks = new Map();
  return {
    schedule(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { due: now + delay, callback });
      return id;
    },
    cancelScheduled(id) {
      tasks.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...tasks.entries()]
          .filter(([, task]) => task.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due;
        tasks.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
    get pending() {
      return tasks.size;
    },
  };
}

function makeHarness({ viewReady, layerViewReady, updating = false, layerUpdating = false } = {}) {
  let listener = null;
  let observedLayerViews = null;
  let removed = 0;
  let layerViewCalls = 0;
  const clock = createClock();
  const layerView = { updating: layerUpdating };
  const view = {
    updating,
    stationary: true,
    destroyed: false,
    when: () => viewReady?.promise ?? Promise.resolve(),
    whenLayerView: () => {
      layerViewCalls += 1;
      return layerViewReady?.promise ?? Promise.resolve(layerView);
    },
  };
  const observeUpdating = (callback, layerViews) => {
    listener = callback;
    observedLayerViews = layerViews;
    return {
      remove() {
        removed += 1;
        listener = null;
      },
    };
  };

  return {
    view,
    clock,
    layerView,
    observeUpdating,
    schedule: clock.schedule,
    cancelScheduled: clock.cancelScheduled,
    change(patch = {}, layerPatch = {}) {
      Object.assign(view, patch);
      Object.assign(layerView, layerPatch);
      listener?.();
    },
    get removed() {
      return removed;
    },
    get observedLayerViews() {
      return observedLayerViews;
    },
    get layerViewCalls() {
      return layerViewCalls;
    },
  };
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

const layer = { visible: true };

test("waits for MapView, visible layer views and a stable initial frame", async () => {
  const viewReady = deferred();
  const layerViewReady = deferred();
  const harness = makeHarness({ viewReady, layerViewReady, updating: true });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    layers: [layer, { visible: false }],
    stableMs: 50,
    timeoutMs: 500,
  });

  await flushMicrotasks();
  assert.equal(harness.observedLayerViews, null);
  viewReady.resolve();
  await flushMicrotasks();
  assert.equal(harness.observedLayerViews, null);
  layerViewReady.resolve(harness.layerView);
  await flushMicrotasks();
  assert.deepEqual(harness.observedLayerViews, [harness.layerView]);
  assert.equal(harness.layerViewCalls, 1, "hidden layers are excluded");

  harness.change({ updating: false });
  harness.clock.advance(49);
  assert.equal(harness.clock.pending, 2);
  harness.clock.advance(1);
  assert.equal((await readiness).status, "ready");
  assert.equal(harness.clock.pending, 0);
  assert.equal(harness.removed, 1);
});

test("resets the quiet period when another map update begins", async () => {
  const harness = makeHarness();
  const readiness = waitForInitialMapReadiness({
    ...harness,
    stableMs: 40,
    timeoutMs: 500,
  });
  await flushMicrotasks();
  harness.clock.advance(30);
  harness.change({ updating: true });
  harness.clock.advance(40);
  assert.equal(harness.clock.pending, 1, "the old idle timer must be cancelled");
  harness.change({ updating: false });
  harness.clock.advance(40);
  assert.equal((await readiness).status, "ready");
});

test("busy layer views and map navigation delay readiness", async () => {
  const harness = makeHarness({ layerUpdating: true });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    layers: [layer],
    stableMs: 30,
    timeoutMs: 500,
  });
  await flushMicrotasks();
  harness.clock.advance(100);
  assert.equal(harness.clock.pending, 1);
  harness.change({ stationary: false }, { updating: false });
  harness.clock.advance(100);
  assert.equal(harness.clock.pending, 1);
  harness.change({ stationary: true });
  harness.clock.advance(30);
  assert.equal((await readiness).status, "ready");
});

test("reports partial readiness when a visible layer view fails", async () => {
  const harness = makeHarness({
    layerViewReady: { promise: Promise.reject(new Error("No layer view")) },
  });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    layers: [layer],
    stableMs: 5,
    timeoutMs: 200,
  });
  await flushMicrotasks();
  harness.clock.advance(5);
  const result = await readiness;
  assert.equal(result.status, "partial");
  assert.equal(result.failedLayerViews, 1);
  assert.equal(harness.removed, 1);
});

test("a stalled MapView has a bounded timeout and cannot register late observers", async () => {
  const viewReady = deferred();
  const harness = makeHarness({ viewReady });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    stableMs: 5,
    timeoutMs: 20,
  });
  harness.clock.advance(20);
  assert.equal((await readiness).status, "timeout");
  viewReady.resolve();
  await flushMicrotasks();
  assert.equal(harness.observedLayerViews, null);
  assert.equal(harness.removed, 0);
  assert.equal(harness.clock.pending, 0);
});

test("aborting after observation releases the watcher and never reports success", async () => {
  const harness = makeHarness({ updating: true });
  const controller = new AbortController();
  const readiness = waitForInitialMapReadiness({
    ...harness,
    signal: controller.signal,
    stableMs: 10,
    timeoutMs: 300,
  });
  await flushMicrotasks();
  controller.abort();
  assert.equal((await readiness).status, "aborted");
  assert.equal(harness.removed, 1);
  assert.equal(harness.clock.pending, 0);
  harness.change({ updating: false });
  assert.equal(harness.removed, 1);
});

test("aborted before startup does not inspect or observe the view", async () => {
  const harness = makeHarness();
  const controller = new AbortController();
  controller.abort();
  const result = await waitForInitialMapReadiness({
    ...harness,
    signal: controller.signal,
    timeoutMs: 100,
  });
  assert.equal(result.status, "aborted");
  assert.equal(harness.observedLayerViews, null);
  assert.equal(harness.clock.pending, 0);
});

test("view initialization failure returns a degraded state instead of trapping the loader", async () => {
  const viewReady = deferred();
  const harness = makeHarness({ viewReady });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    stableMs: 5,
    timeoutMs: 100,
  });
  viewReady.reject(new Error("Basemap failed"));
  const result = await readiness;
  assert.equal(result.status, "error");
  assert.equal(result.error.message, "Basemap failed");
  assert.equal(harness.clock.pending, 0);
});

test("destroying the view during rendering releases the readiness watcher", async () => {
  const harness = makeHarness({ updating: true });
  const readiness = waitForInitialMapReadiness({
    ...harness,
    stableMs: 5,
    timeoutMs: 100,
  });
  await flushMicrotasks();
  harness.change({ destroyed: true });
  assert.equal((await readiness).status, "unavailable");
  assert.equal(harness.removed, 1);
});
