import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedAoiStore } from "../../features/aoi/state/selectedAoiStore.js";
import { JOB_STORE_CHANGE_TYPE } from "../../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../../features/jobs/state/selectedJobStore.js";
import { createMapSyncCoordinator } from "./createMapSyncCoordinator.js";

const BASE_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs",
    relatedAoiIds: ["aoi-1"],
  }),
]);

const UPDATED_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs - refreshed",
    priority: "high",
    relatedAoiIds: ["aoi-2", "aoi-3"],
  }),
]);

test("manual Jobs refresh reapplies selected AOI scope and highlight", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const notices = [];
  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
    aoiName: "AOI 1",
  });

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice: (notice) => notices.push(notice),
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  assert.deepEqual(mapController.refreshJobDataCalls, [{ jobs: BASE_JOBS }]);
  assert.deepEqual(mapController.applyAoiJobScopeCalls, [
    {
      aoiId: "aoi-1",
      aoiName: "AOI 1",
      objectId: "",
    },
  ]);
  assert.deepEqual(mapController.highlightAoiByIdCalls, ["aoi-1"]);
  assert.equal(mapController.applySelectedJobMapScopeCalls.length, 0);
  assert.equal(mapController.highlightJobCalls.length, 0);
  assert.deepEqual(notices, []);
});

test("manual Jobs refresh restores selected Job focus from the refreshed Jobs snapshot", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  selectedJobStore.selectJob({
    jobId: "job-1",
    jobTitle: "Old title",
    relatedAoiIds: ["aoi-old"],
  });

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    getIsSelectedJobMapScopeActive: () => true,
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: UPDATED_JOBS });

  assert.deepEqual(mapController.applySelectedJobMapScopeCalls, [
    {
      jobId: "job-1",
      jobTitle: "Inspect AOI Jobs - refreshed",
      objectId: null,
      geometryType: "",
      priority: "high",
      relatedAoiIds: ["aoi-2", "aoi-3"],
    },
  ]);
  assert.deepEqual(mapController.highlightJobCalls, mapController.applySelectedJobMapScopeCalls);
  assert.deepEqual(
    mapController.highlightRelatedAoisForJobCalls,
    mapController.applySelectedJobMapScopeCalls
  );
  assert.deepEqual(selectedJobStore.getSnapshot().selectedJob.relatedAoiIds, ["aoi-2", "aoi-3"]);
});

test("mutation sync ignores already handled startup-time mutations", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  let isStartupComplete = false;
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    getIsStartupComplete: () => isStartupComplete,
  });
  const firstMutationSnapshot = createMutationSnapshot({ sequence: 1 });

  await coordinator.syncMapAfterJobStoreChange(firstMutationSnapshot);
  isStartupComplete = true;
  await coordinator.syncMapAfterJobStoreChange(firstMutationSnapshot);
  await coordinator.syncMapAfterJobStoreChange(createMutationSnapshot({ sequence: 2 }));

  assert.deepEqual(mapController.refreshJobDataCalls, [
    {
      jobs: BASE_JOBS,
    },
  ]);
});

test("stale map refresh results cannot restore old selection state", async () => {
  const firstRefresh = createDeferred();
  const mapController = createMapControllerSpy({
    refreshResults: [firstRefresh.promise, createMapSuccessResult()],
  });
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
  });

  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
    aoiName: "Old AOI",
  });
  const staleRefresh = coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  selectedAoiStore.selectAoi({
    aoiId: "aoi-2",
    aoiName: "Current AOI",
  });
  await coordinator.refreshMapAfterJobsRefresh({ jobs: UPDATED_JOBS });

  firstRefresh.resolve(createMapSuccessResult());
  await staleRefresh;

  assert.deepEqual(mapController.refreshJobDataCalls, [
    { jobs: BASE_JOBS },
    { jobs: UPDATED_JOBS },
  ]);
  assert.deepEqual(mapController.applyAoiJobScopeCalls, [
    {
      aoiId: "aoi-2",
      aoiName: "Current AOI",
      objectId: "",
    },
  ]);
  assert.deepEqual(mapController.highlightAoiByIdCalls, ["aoi-2"]);
});

test("map refresh failure shows the requested notice and skips selection restore", async () => {
  const mapController = createMapControllerSpy({
    refreshResults: [
      {
        ok: false,
        error: new Error("Layer update failed"),
      },
    ],
  });
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const notices = [];
  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
  });
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice: (notice) => notices.push(notice),
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  assert.deepEqual(notices, [
    {
      title: "Map refresh failed",
      message: "Layer update failed",
    },
  ]);
  assert.equal(mapController.applyAoiJobScopeCalls.length, 0);
  assert.equal(mapController.highlightAoiByIdCalls.length, 0);
});

function createMutationSnapshot({ sequence }) {
  return {
    jobs: BASE_JOBS,
    lastChange: {
      type: JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED,
      sequence,
      jobId: "job-1",
      status: "done",
    },
  };
}

function createMapControllerSpy({ refreshResults = [] } = {}) {
  const controller = {
    refreshJobDataCalls: [],
    applyAoiJobScopeCalls: [],
    highlightAoiByIdCalls: [],
    applySelectedJobMapScopeCalls: [],
    highlightJobCalls: [],
    highlightRelatedAoisForJobCalls: [],
    clearAoiHighlightCalls: 0,
    async refreshJobData(options) {
      controller.refreshJobDataCalls.push({
        jobs: options?.jobs,
      });

      return shiftResult(refreshResults, createMapSuccessResult());
    },
    async applyAoiJobScope(selectedAoi) {
      controller.applyAoiJobScopeCalls.push({ ...selectedAoi });

      return createMapSuccessResult({ jobIds: ["job-1"] });
    },
    async highlightAoiById(aoiId) {
      controller.highlightAoiByIdCalls.push(aoiId);
    },
    async applySelectedJobMapScope(selectedJob) {
      controller.applySelectedJobMapScopeCalls.push(cloneSelectedJob(selectedJob));

      return createMapSuccessResult({ jobIds: [selectedJob.jobId] });
    },
    async highlightJob(selectedJob) {
      controller.highlightJobCalls.push(cloneSelectedJob(selectedJob));
    },
    async highlightRelatedAoisForJob(selectedJob) {
      controller.highlightRelatedAoisForJobCalls.push(cloneSelectedJob(selectedJob));
    },
    clearAoiHighlight() {
      controller.clearAoiHighlightCalls += 1;
    },
  };

  return controller;
}

function cloneSelectedJob(selectedJob) {
  return {
    ...selectedJob,
    relatedAoiIds: [...selectedJob.relatedAoiIds],
  };
}

function createMapSuccessResult(data = {}) {
  return {
    ok: true,
    data,
  };
}

function shiftResult(results, fallback) {
  if (!Array.isArray(results) || results.length === 0) {
    return fallback;
  }

  return results.shift();
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
