import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceFreshnessMonitor } from "./workspaceFreshnessMonitor.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const response = (names, revision = "1") =>
  names.map((datasetName) => ({ datasetName, available: true, revision }));

test("additional priming deduplicates concurrent names and preserves surviving revision baselines", async () => {
  const pending = deferred();
  const calls = [];
  const changes = [];
  let names = ["A"];
  let checking = false;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => names,
    fetchFreshness: async (requested) => {
      calls.push(requested);
      return requested.includes("B") && !checking
        ? pending.promise
        : response(requested, checking ? "2" : "1");
    },
    onChanged: async (changed) => {
      changes.push(changed);
      return true;
    },
    documentRef: null,
  });
  await monitor.prime();
  names = ["A", "B"];
  const first = monitor.primeAdditional(["B"]);
  const duplicate = monitor.primeAdditional(["B"]);
  await Promise.resolve();
  assert.equal(await monitor.check(), false);
  pending.resolve(response(["B"], "2"));
  await Promise.all([first, duplicate]);
  checking = true;
  await monitor.check();
  assert.deepEqual(calls, [["A"], ["B"], ["A", "B"]]);
  assert.deepEqual(changes, [["A"]]);
  monitor.destroy();
});

test("additional baseline waits for an initial prime without serializing independent new baselines", async () => {
  const pending = deferred();
  const calls = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["A", "B", "C"],
    fetchFreshness: async (names) => {
      calls.push(names);
      return names[0] === "A" ? pending.promise : response(names);
    },
    onChanged: async () => true,
    documentRef: null,
  });
  const initial = monitor.prime(["A"]);
  const b = monitor.primeAdditional(["B"]);
  const c = monitor.primeAdditional(["C"]);
  assert.deepEqual(calls, [["A"]]);
  pending.resolve(response(["A"]));
  await Promise.all([initial, b, c]);
  assert.deepEqual(calls, [["A"], ["B"], ["C"]]);
  monitor.destroy();
});

test("failed additional baseline recovers only the new Product", async () => {
  let fail = true;
  let names = ["A"];
  const changes = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => names,
    fetchFreshness: async (requested) => {
      if (requested.includes("B") && fail) throw new Error("B revision failed");
      return response(requested);
    },
    onChanged: async (changed) => {
      changes.push(changed);
      return true;
    },
    documentRef: null,
  });
  await monitor.prime();
  names = ["A", "B"];
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    await monitor.primeAdditional(["B"]);
  } finally {
    console.warn = originalWarn;
  }
  fail = false;
  await monitor.check();
  await monitor.check();
  assert.deepEqual(changes, [["B"]]);
  monitor.destroy();
});

test("disabled retained Product keeps its baseline and is refreshed when re-enabled after a change", async () => {
  let enabled = ["A", "B"];
  let revision = "1";
  const changes = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => enabled,
    getRetainedDatasetNames: () => ["A", "B"],
    fetchFreshness: async (names) =>
      names.map((name) => response([name], name === "B" ? revision : "1")[0]),
    onChanged: async (names) => {
      changes.push(names);
      return true;
    },
    documentRef: null,
  });
  await monitor.prime();
  enabled = ["A"];
  revision = "2";
  await monitor.check();
  enabled = [];
  await monitor.check();
  enabled = ["A", "B"];
  await monitor.check();
  assert.deepEqual(changes, [["B"]]);
  monitor.destroy();
});

test("removed additional prime cannot overwrite a re-added Product baseline", async () => {
  const old = deferred();
  let names = ["A"];
  let bCalls = 0;
  const changes = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => names,
    fetchFreshness: async (requested) => {
      if (requested.includes("B") && ++bCalls === 1) return old.promise;
      return response(requested, "2");
    },
    onChanged: async (changed) => {
      changes.push(changed);
      return true;
    },
    documentRef: null,
  });
  await monitor.prime();
  names = ["A", "B"];
  const first = monitor.primeAdditional(["B"]);
  await Promise.resolve();
  names = ["A"];
  monitor.retain();
  names = ["A", "B"];
  await monitor.primeAdditional(["B"]);
  old.resolve(response(["B"], "1"));
  await first;
  await monitor.check();
  assert.deepEqual(changes, []);
  monitor.destroy();
});

test("full prime and destroy supersede late additional revisions", async () => {
  const old = deferred();
  const changes = [];
  let count = 0;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["B"],
    fetchFreshness: async (names) => (++count === 1 ? old.promise : response(names, "2")),
    onChanged: async (names) => {
      changes.push(names);
      return true;
    },
    documentRef: null,
  });
  const first = monitor.primeAdditional(["B"]);
  await Promise.resolve();
  await monitor.prime(["B"]);
  old.resolve(response(["B"], "1"));
  await first;
  await monitor.check();
  assert.deepEqual(changes, []);
  monitor.destroy();
  assert.equal(await monitor.check(), false);
});

test("composition retention invalidates an older observation without corrupting survivor baselines", async () => {
  const started = deferred();
  const release = deferred();
  const calls = [];
  const changes = [];
  const revisions = { A: "1", C: "1" };
  let names = ["A"];
  let deferNextObservation = false;

  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => names,
    getRetainedDatasetNames: () => names,
    fetchFreshness: async (requested) => {
      calls.push([...requested]);
      const snapshot = requested.map((datasetName) => ({
        datasetName,
        available: true,
        revision: revisions[datasetName],
      }));
      if (deferNextObservation) {
        deferNextObservation = false;
        started.resolve();
        await release.promise;
      }
      return snapshot;
    },
    onChanged: async (changed) => {
      changes.push(changed);
      return true;
    },
    documentRef: null,
  });

  await monitor.prime();
  revisions.A = "2";
  deferNextObservation = true;
  const staleCheck = monitor.check();
  await started.promise;

  names = ["A", "C"];
  monitor.retain();
  await monitor.primeAdditional(["C"]);

  release.resolve();
  assert.equal(await staleCheck, false);
  assert.deepEqual(changes, []);

  assert.equal(await monitor.check(), true);
  assert.deepEqual(changes, [["A"]]);
  assert.deepEqual(calls, [["A"], ["A"], ["C"], ["A", "C"]]);

  const callCount = calls.length;
  assert.equal(await monitor.check(), true);
  assert.equal(calls.length, callCount + 1);
  assert.deepEqual(changes, [["A"]]);
  monitor.destroy();
});
