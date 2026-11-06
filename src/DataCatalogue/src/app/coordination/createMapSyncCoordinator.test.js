import assert from "node:assert/strict";
import test from "node:test";
import { createMapSyncCoordinator } from "./createMapSyncCoordinator.js";

test("cancelPendingRefreshes skips stale selected AOI restore after refresh data resolves", async () => {
  const calls = [];
  let resolveRefresh;
  let refreshStarted;

  const refreshStartedPromise = new Promise((resolve) => {
    refreshStarted = resolve;
  });

  const mapController = {
    refreshJobData() {
      calls.push("refreshJobData");
      refreshStarted();

      return new Promise((resolve) => {
        resolveRefresh = () => resolve({ ok: true, data: {} });
      });
    },
    applyAoiJobScope() {
      calls.push("applyAoiJobScope");

      return Promise.resolve({ ok: true, data: { jobIds: ["job-1"] } });
    },
    highlightAoiById() {
      calls.push("highlightAoiById");

      return Promise.resolve();
    },
  };

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore: createSelectedAoiStoreStub({ aoiId: "aoi-1" }),
    selectedJobStore: createSelectedJobStoreStub(),
    showErrorNotice: () => {},
  });

  const refreshPromise = coordinator.refreshMapAfterJobsRefresh({ jobs: [] });

  await refreshStartedPromise;
  coordinator.cancelPendingRefreshes();
  resolveRefresh();
  await refreshPromise;

  assert.deepEqual(calls, ["refreshJobData"]);
});

test("cancelPendingRefreshes skips stale selected AOI highlight after scope restore resolves", async () => {
  const calls = [];
  let resolveScope;
  let scopeStarted;

  const scopeStartedPromise = new Promise((resolve) => {
    scopeStarted = resolve;
  });

  const mapController = {
    refreshJobData() {
      calls.push("refreshJobData");

      return Promise.resolve({ ok: true, data: {} });
    },
    applyAoiJobScope() {
      calls.push("applyAoiJobScope");
      scopeStarted();

      return new Promise((resolve) => {
        resolveScope = () => resolve({ ok: true, data: { jobIds: ["job-1"] } });
      });
    },
    highlightAoiById() {
      calls.push("highlightAoiById");

      return Promise.resolve();
    },
  };

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore: createSelectedAoiStoreStub({ aoiId: "aoi-1" }),
    selectedJobStore: createSelectedJobStoreStub(),
    showErrorNotice: () => {},
  });

  const refreshPromise = coordinator.refreshMapAfterJobsRefresh({ jobs: [] });

  await scopeStartedPromise;
  coordinator.cancelPendingRefreshes();
  resolveScope();
  await refreshPromise;

  assert.deepEqual(calls, ["refreshJobData", "applyAoiJobScope"]);
});

function createSelectedAoiStoreStub(selectedAoi = null) {
  return {
    getSnapshot() {
      return {
        selectedAoi,
      };
    },
  };
}

function createSelectedJobStoreStub(selectedJob = null) {
  return {
    getSnapshot() {
      return {
        selectedJob,
      };
    },
    selectJob(job) {
      return job;
    },
  };
}

test("cancellation suppresses AOI highlight when a pending scope request rejects", async () => {
  let rejectScope;
  let scopeStarted;
  const ready = new Promise((resolve) => {
    scopeStarted = resolve;
  });
  const calls = [];
  const notices = [];
  const mapController = {
    async refreshJobData() {
      return { ok: true, data: {} };
    },
    applyAoiJobScope() {
      scopeStarted();
      return new Promise((resolve, reject) => {
        rejectScope = reject;
      });
    },
    async highlightAoiById() {
      calls.push("highlightAoiById");
    },
  };
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore: createSelectedAoiStoreStub({ aoiId: "aoi-1" }),
    selectedJobStore: createSelectedJobStoreStub(),
    showErrorNotice: (notice) => notices.push(notice),
  });

  const request = coordinator.refreshMapAfterJobsRefresh({ jobs: [] });
  await ready;
  coordinator.cancelPendingRefreshes();
  rejectScope(new Error("Scope unavailable"));
  await request;

  assert.deepEqual(calls, []);
  assert.deepEqual(notices, []);
});

test("cancellation suppresses Job highlight after a failed selected-Job scope", async () => {
  let rejectScope;
  let scopeStarted;
  const ready = new Promise((resolve) => {
    scopeStarted = resolve;
  });
  const calls = [];
  const notices = [];
  const mapController = {
    async refreshJobData() {
      return { ok: true, data: {} };
    },
    applySelectedJobMapScope() {
      scopeStarted();
      return new Promise((resolve, reject) => {
        rejectScope = reject;
      });
    },
    async highlightJob() {
      calls.push("highlightJob");
    },
  };
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore: createSelectedAoiStoreStub(),
    selectedJobStore: createSelectedJobStoreStub({ jobId: "job-1", relatedAoiIds: [] }),
    getIsSelectedJobMapScopeActive: () => true,
    showErrorNotice: (notice) => notices.push(notice),
  });

  const request = coordinator.refreshMapAfterJobsRefresh({ jobs: [] });
  await ready;
  coordinator.cancelPendingRefreshes();
  rejectScope(new Error("Scope unavailable"));
  await request;

  assert.deepEqual(calls, []);
  assert.deepEqual(notices, []);
});
