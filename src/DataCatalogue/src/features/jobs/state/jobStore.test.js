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

test("last successful Packages read is retained for a failed refresh but reset for a new Workspace scope", async () => {
  let calls = 0;
  let finishScopedRead;
  const store = createJobStore({
    service: {
      loadJobs() {
        calls++;
        if (calls === 1) return Promise.resolve(createSuccessResult({ jobs: [BASE_JOB] }));
        if (calls === 2) return Promise.resolve(createErrorResult("Offline"));
        return new Promise((resolve) => {
          finishScopedRead = resolve;
        });
      },
    },
  });

  assert.equal(store.getSnapshot().lastSuccessfulLoadAt, null);
  const before = Date.now();
  await store.loadJobs();
  const initialTime = store.getSnapshot().lastSuccessfulLoadAt;
  assert.ok(initialTime >= before && initialTime <= Date.now());

  await store.loadJobs();
  assert.equal(store.getSnapshot().lastSuccessfulLoadAt, initialTime);
  assert.match(store.getSnapshot().error.message, /Offline/);

  const scopedRead = store.loadJobs({ clear: true });
  assert.equal(store.getSnapshot().lastSuccessfulLoadAt, null);
  assert.deepEqual(store.getSnapshot().jobs, []);
  finishScopedRead(createSuccessResult({ jobs: [BASE_JOB] }));
  await scopedRead;
  assert.ok(Number.isFinite(store.getSnapshot().lastSuccessfulLoadAt));
});

test("superseded Packages read never updates the successful read timestamp", async () => {
  let finishOld;
  let calls = 0;
  const store = createJobStore({
    service: {
      loadJobs() {
        calls++;
        if (calls === 1) {
          return new Promise((resolve) => {
            finishOld = resolve;
          });
        }
        return Promise.resolve(createSuccessResult({ jobs: [BASE_JOB] }));
      },
    },
  });

  const old = store.loadJobs();
  await store.loadJobs();
  const latest = store.getSnapshot().lastSuccessfulLoadAt;
  finishOld(createSuccessResult({ jobs: [] }));
  assert.equal((await old).stale, true);
  assert.equal(store.getSnapshot().lastSuccessfulLoadAt, latest);
  assert.equal(store.getSnapshot().jobs.length, 1);
});

test("A dirty membership generation only acknowledges its own current successful read", async () => {
  const requests = [];
  const catalogue = { workspaces: [] };
  const publications = [];
  const store = createJobStore({
    service: {
      loadJobs(options) {
        return new Promise((resolve) => requests.push({ ...options, resolve }));
      },
    },
  });
  store.subscribe((snapshot, workspaceCatalogue) => {
    if (workspaceCatalogue) publications.push(snapshot.jobs);
  });
  const initial = store.loadJobs();
  assert.equal(requests[0].freshWorkspaceCatalogue, undefined);
  requests[0].resolve(createSuccessResult({ jobs: [BASE_JOB] }));
  await initial;

  store.invalidateMembership();
  const beforeLeave = store.loadJobs();
  assert.equal(store.loadJobs({ cancelOnLeave: true }), beforeLeave);
  store.cancelNavigationLoad();
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(store.hasPendingMembershipRefresh(), true);
  assert.equal(store.getSnapshot().jobs[0].id, BASE_JOB.id);

  const older = store.loadJobs();
  store.invalidateMembership();
  assert.equal(requests[2].signal.aborted, true);
  const failed = store.loadJobs();
  requests[3].resolve(createErrorResult("Overview offline"));
  assert.equal((await failed).ok, false);
  assert.equal(store.hasPendingMembershipRefresh(), true);
  assert.equal(store.getSnapshot().error.message, "Overview offline");
  assert.equal(store.getSnapshot().jobs[0].id, BASE_JOB.id);

  const newest = store.loadJobs();
  requests[2].resolve(createSuccessResult({ jobs: [], workspaceCatalogue: catalogue }));
  assert.equal((await older).stale, true);
  assert.equal(store.hasPendingMembershipRefresh(), true);
  requests[4].resolve(createSuccessResult({ jobs: [], workspaceCatalogue: catalogue }));
  await newest;
  assert.equal(store.hasPendingMembershipRefresh(), false);
  requests[1].resolve(createSuccessResult({ jobs: [BASE_JOB], workspaceCatalogue: catalogue }));
  assert.equal((await beforeLeave).stale, true);
  assert.deepEqual(publications, [[]]);
  assert.equal(
    requests.slice(1).every((request) => request.freshWorkspaceCatalogue),
    true
  );

  store.invalidateMembership();
  const disposed = store.loadJobs();
  store.destroy();
  assert.equal(requests[5].signal.aborted, true);
  requests[5].resolve(createSuccessResult({ jobs: [BASE_JOB], workspaceCatalogue: catalogue }));
  assert.equal((await disposed).stale, true);
  assert.deepEqual(publications, [[]]);
});
