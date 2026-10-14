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
  const controller = {
    getState: (id) => states.get(id) ?? null,
    refreshProductStatus(id, datasetName) {
      calls.push({ id, datasetName });
      return response();
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

test("simultaneous observations share one source operation and respect cooldown", async () => {
  const h = harness();
  const pending = deferred();
  h.respond(() => pending.promise);
  const first = h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
  const second = h.coordinator.request({ sourceId: "s101", datasetName: "PRIMARY" });
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
