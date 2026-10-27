import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_STATUS_REFRESH_COOLDOWN_MS,
  createSourceStatusRefreshCoordinator,
} from "./sourceStatusRefreshCoordinator.js";

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function harness() {
  let clock = 100_000;
  let response = () => ({ success: true });
  let globalRefreshInProgress = false;
  const calls = [];
  const states = new Map([
    ["s101", { enabled: true, requestedEnabled: true, loading: false }],
    ["s102", { enabled: false, requestedEnabled: false, loading: false }],
  ]);
  const subscribers = new Set();
  const controller = {
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    getState: (id) => states.get(id) ?? null,
    refreshProductStatus(id, datasetName) {
      calls.push({ id, datasetName });
      return response(id, datasetName);
    },
  };
  const coordinator = createSourceStatusRefreshCoordinator({
    dataSourceController: controller,
    isGlobalRefreshInProgress: () => globalRefreshInProgress,
    now: () => clock,
  });
  return {
    coordinator,
    calls,
    states,
    changeSourceState(sourceId, patch) {
      Object.assign(states.get(sourceId), patch);
      for (const notify of subscribers) notify(null, { type: "state-changed", sourceId });
    },
    globalRefresh(inProgress) {
      globalRefreshInProgress = inProgress;
    },
    tick(ms) {
      clock += ms;
    },
    respond(fn) {
      response = fn;
    },
  };
}

test("one targeted status read is requested for mismatching package detail", async () => {
  const h = harness();
  const result = await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  assert.deepEqual(result, { success: true });
  assert.deepEqual(h.calls, [
    {
      id: "s101",
      datasetName: "PRIMARY",
    },
  ]);
  assert.equal(SOURCE_STATUS_REFRESH_COOLDOWN_MS, 30_000);
  h.coordinator.destroy();
});

test("same normalized source/Product observations share one operation and respect cooldown", async () => {
  const h = harness();
  const pending = deferred();
  h.respond(() => pending.promise);
  const first = h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  const second = h.coordinator.request({ sourceId: " s101 ", datasetName: " primary " });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  pending.resolve({ success: true });
  await first;
  const skipped = await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  assert.equal(skipped.reason, "cooldown");
  assert.equal(h.calls.length, 1);
  h.tick(30_000);
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).success,
    true
  );
  assert.equal(h.calls.length, 2);
  h.coordinator.destroy();
});

test("inactive and in-progress sources are never reactivated by popup drift", async () => {
  const h = harness();
  assert.equal(
    (await h.coordinator.request({ sourceId: "s102", datasetName: "PRIMARY" })).reason,
    "inactive-source"
  );
  assert.equal(
    (await h.coordinator.request({ sourceId: "other", datasetName: "PRIMARY" })).reason,
    "inactive-source"
  );
  h.states.get("s101").loading = true;
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).reason,
    "refresh-in-progress"
  );
  assert.deepEqual(h.calls, []);
  h.states.get("s101").loading = false;
  h.globalRefresh(true);
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).reason,
    "refresh-in-progress"
  );
  h.globalRefresh(false);
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).success,
    true
  );
  assert.equal(h.calls.length, 1);
  h.coordinator.destroy();
});

test("a source disabled before microtask publication cannot be reactivated", async () => {
  const h = harness();
  const pending = h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  h.states.get("s101").requestedEnabled = false;
  assert.equal((await pending).reason, "source-unavailable");
  assert.deepEqual(h.calls, []);
  h.states.get("s101").requestedEnabled = true;
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).success,
    true
  );
  assert.equal(h.calls.length, 1);
  h.coordinator.destroy();
});

test("destroy prevents queued source activation and future drift requests", async () => {
  const h = harness();
  const pending = h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  h.coordinator.destroy();
  assert.equal((await pending).reason, "destroyed");
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).reason,
    "destroyed"
  );
  assert.deepEqual(h.calls, []);
});

test("failed source refresh is contained and can retry after cooldown", async () => {
  const h = harness();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    h.respond(async () => {
      throw new Error("AOI request failed");
    });
    const result = await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
    assert.equal(result.success, false);
    assert.match(result.error.message, /AOI request failed/);
    assert.equal(
      (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).reason,
      "cooldown"
    );
    h.tick(30_000);
    h.respond(() => ({ success: true }));
    assert.equal(
      (await h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" })).success,
      true
    );
    assert.equal(h.calls.length, 2);
  } finally {
    console.warn = originalWarn;
    h.coordinator.destroy();
  }
});

for (const completionOrder of [
  ["A", "B"],
  ["B", "A"],
]) {
  test(`different Products in one source refresh independently (${completionOrder.join(" then ")})`, async () => {
    const h = harness();
    const responses = new Map([
      ["A", deferred()],
      ["B", deferred()],
    ]);
    h.respond((_id, name) => responses.get(name)?.promise ?? { success: true });
    const first = h.coordinator.request({ sourceId: "s101", datasetName: "A" });
    const second = h.coordinator.request({ sourceId: "s101", datasetName: "B" });
    assert.notEqual(first, second);
    await Promise.resolve();
    assert.deepEqual(h.calls, [
      { id: "s101", datasetName: "A" },
      { id: "s101", datasetName: "B" },
    ]);
    for (const name of completionOrder) {
      responses.get(name).resolve({ success: true, name });
    }
    assert.deepEqual(await Promise.all([first, second]), [
      { success: true, name: "A" },
      { success: true, name: "B" },
    ]);
    assert.equal(
      (await h.coordinator.request({ sourceId: "s101", datasetName: "A" })).reason,
      "cooldown"
    );
    assert.equal(
      (await h.coordinator.request({ sourceId: "s101", datasetName: "B" })).reason,
      "cooldown"
    );
    assert.equal(
      (await h.coordinator.request({ sourceId: "s101", datasetName: "C" })).success,
      true
    );
    h.coordinator.destroy();
  });
}

test("a source entering refresh rejects different queued Products without dispatch", async () => {
  const h = harness();
  const first = h.coordinator.request({ sourceId: "s101", datasetName: "A" });
  const second = h.coordinator.request({ sourceId: "s101", datasetName: "B" });
  h.states.get("s101").loading = true;
  assert.equal((await first).reason, "source-unavailable");
  assert.equal((await second).reason, "source-unavailable");
  assert.equal(h.calls.length, 0);
  h.coordinator.destroy();
});

test("replaced source representation retires in-flight identity and previous cooldown", async () => {
  const h = harness();
  const older = deferred();
  const newer = deferred();
  let count = 0;
  h.respond(() => (++count === 1 ? older.promise : newer.promise));
  const first = h.coordinator.request({ sourceId: "s101", datasetName: "A" });
  await Promise.resolve();
  assert.equal(count, 1);
  h.changeSourceState("s101", { loading: true });
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "A" })).reason,
    "refresh-in-progress"
  );
  h.changeSourceState("s101", { loading: false });
  const replacement = h.coordinator.request({ sourceId: "s101", datasetName: "A" });
  assert.notEqual(first, replacement);
  await Promise.resolve();
  assert.equal(count, 2);
  newer.resolve({ success: true, generation: "new" });
  assert.deepEqual(await replacement, { success: true, generation: "new" });
  older.resolve({ success: false, stale: true });
  assert.equal((await first).stale, true);
  assert.equal(
    (await h.coordinator.request({ sourceId: "s101", datasetName: "A" })).reason,
    "cooldown"
  );
  assert.equal(h.calls.length, 2);
  h.coordinator.destroy();
});

test("queued request is retired if a source reload completes before its microtask", async () => {
  const h = harness();
  const older = h.coordinator.request({ sourceId: "s101", datasetName: "A" });
  h.changeSourceState("s101", { loading: true });
  h.changeSourceState("s101", { loading: false });
  assert.equal((await older).reason, "source-unavailable");
  assert.deepEqual(h.calls, []);
  assert.equal((await h.coordinator.request({ sourceId: "s101", datasetName: "A" })).success, true);
  assert.equal(h.calls.length, 1);
  h.coordinator.destroy();
});
