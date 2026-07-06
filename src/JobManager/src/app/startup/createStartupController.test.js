import assert from "node:assert/strict";
import test from "node:test";

import { createStartupController } from "./createStartupController.js";

const SAMPLE_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs",
    relatedAoiIds: ["aoi-1"],
  }),
]);

test("startup controller loads map, Jobs and Job map layers in order", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({ calls });
  let blockedCount = 0;
  let completeCount = 0;

  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {
      calls.push("paint");
    },
  });

  const result = await controller.runStartup({
    onStartupBlocked() {
      blockedCount += 1;
    },
    onStartupComplete() {
      completeCount += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(blockedCount, 1);
  assert.equal(completeCount, 1);
  assert.deepEqual(mapController.startCalls[0], {
    requireAois: true,
    deferJobGeometry: true,
    suppressStatus: true,
  });
  assert.deepEqual(mapController.refreshCalls[0], { jobs: SAMPLE_JOBS });
  assert.deepEqual(controller.getSnapshot(), {
    mapReady: true,
    mapResult: { viewId: "map-view" },
    jobsReady: true,
    jobs: SAMPLE_JOBS,
    jobMapReady: true,
  });
  assert.deepEqual(getStageCallOrder(calls), [
    "retry:map workspace",
    "map:start",
    "retry:Jobs load",
    "jobs:load",
    "retry:Job map rendering",
    "map:refreshJobData",
    "paint",
  ]);
  assert.equal(loader.completeCalls.at(-1).text, "Job Manager ready.");
});

test("startup retry after Jobs load failure reuses the ready map workspace", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({
    calls,
    loadResults: [
      {
        ok: false,
        error: new Error("Jobs unavailable"),
      },
      {
        ok: true,
        data: {
          jobs: SAMPLE_JOBS,
        },
      },
    ],
  });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const firstResult = await controller.runStartup();
  const secondResult = await controller.runStartup();

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.error.message, "Jobs unavailable");
  assert.equal(secondResult.ok, true);
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 2);
  assert.equal(mapController.refreshCalls.length, 1);
  assert.equal(loader.startLoadingCalls[1], "Loading Jobs...");
  assert.equal(loader.failCalls.length, 1);
});

test("startup retry after Job map rendering failure reuses loaded map and Jobs", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({
    calls,
    refreshResults: [
      {
        ok: false,
        error: new Error("Job layers unavailable"),
      },
      {
        ok: true,
        data: {
          pointCount: 1,
          polygonCount: 0,
        },
      },
    ],
  });
  const jobStore = createJobStoreStub({ calls });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const firstResult = await controller.runStartup();
  const secondResult = await controller.runStartup();

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.error.message, "Job layers unavailable");
  assert.equal(secondResult.ok, true);
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 1);
  assert.equal(mapController.refreshCalls.length, 2);
  assert.equal(loader.startLoadingCalls[1], "Rendering Jobs on the map...");
  assert.equal(loader.failCalls.length, 1);
});

test("startup controller rejects invalid Jobs load results before rendering Job layers", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({
    calls,
    loadResults: [
      {
        ok: true,
        data: {
          jobs: null,
        },
      },
    ],
  });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const result = await controller.runStartup();

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Jobs loader returned an invalid result.");
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 1);
  assert.equal(mapController.refreshCalls.length, 0);
});

function createDirectRetryRunner(calls) {
  return async (task, options) => {
    calls.push(`retry:${options?.label ?? "unknown"}`);

    return task();
  };
}

function createStartupLoaderSpy(calls) {
  const loader = {
    startLoadingCalls: [],
    retryCountdownCalls: [],
    markDataReceivedCalls: [],
    renderingCalls: [],
    completeCalls: [],
    failCalls: [],
    startLoading(text) {
      calls.push(`loader:start:${text}`);
      loader.startLoadingCalls.push(text);
    },
    setText(text) {
      calls.push(`loader:text:${text}`);
    },
    setDetail(detail) {
      calls.push(`loader:detail:${detail}`);
    },
    setProgress(progress) {
      calls.push(`loader:progress:${progress}`);
    },
    startRetryCountdown(options) {
      calls.push(`loader:retry:${options.label}`);
      loader.retryCountdownCalls.push(options);
    },
    markDataReceived(options) {
      calls.push(`loader:data:${options.text}`);
      loader.markDataReceivedCalls.push(options);
    },
    startRendering(options) {
      calls.push(`loader:render:${options.text}`);
      loader.renderingCalls.push(options);
    },
    complete(options) {
      calls.push(`loader:complete:${options.text}`);
      loader.completeCalls.push(options);
    },
    fail(options) {
      calls.push(`loader:fail:${options.text}`);
      loader.failCalls.push(options);
    },
  };

  return loader;
}

function createMapControllerStub({ calls, startResults, refreshResults } = {}) {
  const controller = {
    startCalls: [],
    refreshCalls: [],
    async start(options) {
      calls.push("map:start");
      controller.startCalls.push({ ...options });

      return shiftResult(startResults, {
        ok: true,
        data: {
          viewId: "map-view",
        },
      });
    },
    async refreshJobData(options) {
      calls.push("map:refreshJobData");
      controller.refreshCalls.push({
        jobs: options?.jobs,
      });

      return shiftResult(refreshResults, {
        ok: true,
        data: {
          pointCount: 1,
          polygonCount: 0,
        },
      });
    },
  };

  return controller;
}

function createJobStoreStub({ calls, loadResults } = {}) {
  const store = {
    loadCalls: [],
    async loadJobs() {
      calls.push("jobs:load");
      store.loadCalls.push({});

      return shiftResult(loadResults, {
        ok: true,
        data: {
          jobs: SAMPLE_JOBS,
        },
      });
    },
  };

  return store;
}

function shiftResult(results, fallback) {
  if (!Array.isArray(results) || results.length === 0) {
    return fallback;
  }

  return results.shift();
}

function getStageCallOrder(calls) {
  return calls.filter((call) =>
    ["retry:", "map:", "jobs:", "paint"].some((prefix) => call.startsWith(prefix))
  );
}
