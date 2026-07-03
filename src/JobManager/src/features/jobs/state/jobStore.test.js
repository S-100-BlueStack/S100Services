import assert from "node:assert/strict";
import test from "node:test";

import { createJobStore, JOB_STORE_CHANGE_TYPE } from "./jobStore.js";

const BASE_JOB = Object.freeze({
  id: "job-001",
  title: "Test Job",
  status: "todo",
  priority: "high",
  relatedAoiIds: ["aoi-001"],
});

test("createJobStore loads Jobs through the injected service", async () => {
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createSuccessResult({
          job: BASE_JOB,
          createdJobs: [],
        });
      },
    },
  });

  const result = await store.loadJobs();
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, true);
  assert.equal(snapshot.isLoading, false);
  assert.equal(snapshot.error, null);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOBS_LOADED);
  assert.equal(snapshot.lastChange.jobCount, 1);
});

test("createJobStore replaces the mutated Job and keeps created Jobs queued", async () => {
  const updatedJob = {
    ...BASE_JOB,
    status: "done",
  };
  const createdJob = {
    id: "job-created",
    title: "Created Job",
    status: "todo",
    priority: "medium",
    relatedAoiIds: ["aoi-002"],
  };
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createSuccessResult({
          job: updatedJob,
          createdJobs: [createdJob],
        });
      },
    },
  });

  await store.loadJobs();
  const result = await store.updateJobStatus("job-001", "done");
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, true);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.jobs[0].status, "done");
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED);
  assert.equal(snapshot.lastChange.jobId, "job-001");
  assert.equal(snapshot.lastChange.status, "done");
  assert.equal(snapshot.lastChange.createdJobCount, 1);
});

test("createJobStore keeps existing Jobs after mutation failure", async () => {
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createErrorResult("Mutation failed.");
      },
    },
  });

  await store.loadJobs();
  const result = await store.updateJobStatus("job-001", "done");
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, false);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.jobs[0].status, "todo");
  assert.equal(snapshot.error.message, "Mutation failed.");
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATE_FAILED);
  assert.equal(snapshot.lastChange.jobId, "job-001");
  assert.equal(snapshot.lastChange.status, "done");
});

function createSuccessResult(data) {
  return {
    ok: true,
    data,
    error: null,
    meta: {},
  };
}

function createErrorResult(message) {
  return {
    ok: false,
    data: null,
    error: {
      isNormalizedError: true,
      name: "Error",
      message,
      status: null,
      code: null,
    },
    meta: {},
  };
}
