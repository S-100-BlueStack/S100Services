import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceFreshnessMonitor } from "./workspaceFreshnessMonitor.js";

function createDocumentStub() {
  const listeners = new Map();
  return {
    hidden: false,
    visibilityState: "visible",
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    hasListener(type) {
      return listeners.has(type);
    },
  };
}

test("workspace monitor primes revisions and refreshes only after a later change", async () => {
  const revisions = ["v1:a", "v1:a", "v1:b"];
  const changed = [];
  let calls = 0;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["101DK001"],
    fetchFreshness: async () => [
      { datasetName: "101DK001", revision: revisions[calls++], available: true },
    ],
    onChanged: async (datasetNames) => {
      changed.push(datasetNames);
      return true;
    },
    documentRef: createDocumentStub(),
    setIntervalFn: null,
    clearIntervalFn: null,
  });

  assert.equal(await monitor.prime(), true);
  assert.equal(await monitor.check(), true);
  assert.deepEqual(changed, []);
  assert.equal(await monitor.check(), true);
  assert.deepEqual(changed, [["101DK001"]]);
  monitor.destroy();
});

test("workspace monitor refreshes once after a failed prime before accepting a recovered baseline", async () => {
  let failPrime = true;
  let refreshCalls = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const monitor = createWorkspaceFreshnessMonitor({
      getDatasetNames: () => ["101DK001"],
      fetchFreshness: async () => {
        if (failPrime) {
          throw new Error("temporary freshness failure");
        }
        return [{ datasetName: "101DK001", revision: "v1:recovered", available: true }];
      },
      onChanged: async (datasetNames) => {
        refreshCalls += 1;
        assert.deepEqual(datasetNames, ["101DK001"]);
        return true;
      },
      documentRef: createDocumentStub(),
      setIntervalFn: null,
      clearIntervalFn: null,
    });

    assert.equal(await monitor.prime(), false);
    failPrime = false;
    assert.equal(await monitor.check(), true);
    assert.equal(refreshCalls, 1);
    assert.equal(await monitor.check(), true);
    assert.equal(refreshCalls, 1);
    monitor.destroy();
  } finally {
    console.warn = originalWarn;
  }
});

test("workspace monitor retries a changed revision when refresh declines publication", async () => {
  let revision = "v1:a";
  let refreshCalls = 0;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["101DK001"],
    fetchFreshness: async () => [{ datasetName: "101DK001", revision, available: true }],
    onChanged: async () => {
      refreshCalls += 1;
      return refreshCalls > 1;
    },
    documentRef: createDocumentStub(),
    setIntervalFn: null,
    clearIntervalFn: null,
  });

  await monitor.prime();
  revision = "v1:b";
  assert.equal(await monitor.check(), false);
  assert.equal(await monitor.check(), true);
  assert.equal(refreshCalls, 2);
  monitor.destroy();
});

test("workspace monitor coalesces concurrent checks", async () => {
  let resolveFetch;
  let fetchCalls = 0;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["101DK001"],
    fetchFreshness: () => {
      fetchCalls += 1;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
    onChanged: async () => true,
    documentRef: createDocumentStub(),
    setIntervalFn: null,
    clearIntervalFn: null,
  });

  const first = monitor.check();
  const second = monitor.check();
  assert.equal(fetchCalls, 1);
  resolveFetch([{ datasetName: "101DK001", revision: "v1:a", available: true }]);
  assert.equal(await first, true);
  assert.equal(await second, true);
  monitor.destroy();
});

test("workspace monitor checks immediately when a hidden tab becomes visible", async () => {
  const documentRef = createDocumentStub();
  let fetchCalls = 0;
  let intervalCallback = null;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["101DK001"],
    fetchFreshness: async () => {
      fetchCalls += 1;
      return [{ datasetName: "101DK001", revision: "v1:a", available: true }];
    },
    onChanged: async () => true,
    documentRef,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 7;
    },
    clearIntervalFn: () => {},
  });

  monitor.start();
  assert.equal(documentRef.hasListener("visibilitychange"), true);

  documentRef.hidden = true;
  documentRef.visibilityState = "hidden";
  intervalCallback();
  await Promise.resolve();
  assert.equal(fetchCalls, 0);

  documentRef.hidden = false;
  documentRef.visibilityState = "visible";
  documentRef.dispatch("visibilitychange");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);

  monitor.destroy();
  assert.equal(documentRef.hasListener("visibilitychange"), false);
});

test("destroyed workspace monitor ignores late freshness results", async () => {
  let resolveFetch;
  let changed = 0;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => ["101DK001"],
    fetchFreshness: () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    onChanged: async () => {
      changed += 1;
      return true;
    },
    documentRef: createDocumentStub(),
    setIntervalFn: null,
    clearIntervalFn: null,
  });

  const pending = monitor.check();
  monitor.destroy();
  resolveFetch([{ datasetName: "101DK001", revision: "v1:b", available: true }]);
  assert.equal(await pending, false);
  assert.equal(changed, 0);
});
