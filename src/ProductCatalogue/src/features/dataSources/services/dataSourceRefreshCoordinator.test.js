import assert from "node:assert/strict";
import test from "node:test";

import {
  createDataSourceRefreshCoordinator,
  DEFAULT_REFRESH_INTERVAL_MS,
} from "./dataSourceRefreshCoordinator.js";

test("manual refresh runs compatibility and active-source refresh independently", async () => {
  const calls = [];
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      stopAuto() {
        calls.push("stop-compatibility-auto");
      },
      async refresh(options) {
        calls.push(["compatibility", options.source]);
        return { success: true };
      },
    },
    dataSourceController: {
      async refreshActive(options) {
        calls.push(["sources", options]);
        return { failedSourceIds: [] };
      },
    },
  });

  const result = await coordinator.refresh({ source: "manual" });
  assert.equal(result.success, true);
  assert.deepEqual(calls, [
    "stop-compatibility-auto",
    ["compatibility", "manual"],
    ["sources", { reason: "manual-refresh", silent: false }],
  ]);
});

test("auto refresh is silent for source failures and keeps one shared timer", () => {
  const timers = new Map();
  let nextTimerId = 0;
  const timer = {
    setInterval(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      return nextTimerId;
    },
    clearInterval(timerId) {
      timers.delete(timerId);
    },
  };
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: { stopAuto() {}, refresh: async () => ({ success: true }) },
    dataSourceController: { refreshActive: async () => ({ failedSourceIds: [] }) },
    refreshIntervalMs: 1234,
    timer,
  });

  coordinator.startAuto();
  coordinator.startAuto();

  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 1234);
  coordinator.destroy();
  assert.equal(timers.size, 0);
});

test("coordinator reports a source failure without blocking compatibility success", async () => {
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      stopAuto() {},
      refresh: async () => ({ success: true, graphicsCount: 10 }),
    },
    dataSourceController: {
      refreshActive: async () => ({ failedSourceIds: ["s102"] }),
    },
  });

  const result = await coordinator.refresh({ source: "manual" });
  assert.equal(result.success, false);
  assert.equal(result.compatibilityResult.success, true);
  assert.deepEqual(result.dataSourceResult.failedSourceIds, ["s102"]);
});

test("concurrent coordinator refresh is skipped", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      stopAuto() {},
      refresh: async () => pending,
    },
    dataSourceController: {
      refreshActive: async () => pending,
    },
  });

  const first = coordinator.refresh({ source: "manual" });
  const second = await coordinator.refresh({ source: "auto" });
  assert.deepEqual(second, {
    success: false,
    skipped: true,
    reason: "already-refreshing",
    source: "auto",
  });
  release({ success: true, failedSourceIds: [] });
  await first;
});

test("default auto-refresh cadence is two minutes, with one coordinator timer", () => {
  const delays = [];
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: { stopAuto() {}, refresh: async () => ({ success: true }) },
    dataSourceController: { refreshActive: async () => ({ failedSourceIds: [] }) },
    timer: {
      setInterval: (_, delay) => {
        delays.push(delay);
        return 12;
      },
      clearInterval() {},
    },
  });
  coordinator.startAuto();
  assert.deepEqual(delays, [DEFAULT_REFRESH_INTERVAL_MS]);
  assert.equal(DEFAULT_REFRESH_INTERVAL_MS, 120_000);
  coordinator.destroy();
});

test("hidden tabs defer auto-refresh until visible, without requests stacking", async () => {
  const timers = new Map();
  const listeners = new Map();
  let requestCount = 0;
  let releaseRefresh;
  const documentRef = {
    hidden: true,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      stopAuto() {},
      refresh() {
        requestCount++;
        return new Promise((resolve) => {
          releaseRefresh = resolve;
        });
      },
    },
    dataSourceController: { refreshActive: async () => ({ failedSourceIds: [] }) },
    timer: {
      setInterval(callback, ms) {
        timers.set(1, { callback, ms });
        return 1;
      },
      clearInterval(id) {
        timers.delete(id);
      },
    },
    documentRef,
  });
  coordinator.startAuto();
  assert.equal(listeners.has("visibilitychange"), true);
  timers.get(1).callback();
  timers.get(1).callback();
  assert.equal(requestCount, 0);

  documentRef.hidden = false;
  listeners.get("visibilitychange")();
  assert.equal(requestCount, 1);
  timers.get(1).callback();
  assert.equal(requestCount, 1);
  releaseRefresh({ success: true });
  await Promise.resolve();
  await Promise.resolve();
  coordinator.setAuto(false);
  assert.equal(timers.size, 0);
  assert.equal(listeners.has("visibilitychange"), false);
});

test("disabling automatic refresh discards a deferred hidden-tab refresh", () => {
  let tick;
  const listeners = new Map();
  let refreshCount = 0;
  const documentRef = {
    hidden: true,
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  const coordinator = createDataSourceRefreshCoordinator({
    compatibilityRefreshService: {
      stopAuto() {},
      refresh: async () => {
        refreshCount++;
        return { success: true };
      },
    },
    dataSourceController: { refreshActive: async () => ({ failedSourceIds: [] }) },
    timer: {
      setInterval(callback) {
        tick = callback;
        return 1;
      },
      clearInterval() {},
    },
    documentRef,
  });
  coordinator.startAuto();
  tick();
  coordinator.setAuto(false);
  documentRef.hidden = false;
  listeners.get("visibilitychange")?.();
  assert.equal(refreshCount, 0);
  coordinator.destroy();
});
