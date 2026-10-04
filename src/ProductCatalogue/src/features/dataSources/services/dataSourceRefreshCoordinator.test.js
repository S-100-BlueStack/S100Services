import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRefreshCoordinator } from "./dataSourceRefreshCoordinator.js";

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
