import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedJobStore, normalizeSelectedJob } from "./selectedJobStore.js";

test("normalizeSelectedJob normalizes popup-derived Job values", () => {
  assert.deepEqual(
    normalizeSelectedJob({
      jobId: "job-001",
      jobTitle: "Harbour update",
      objectId: "12",
      geometryType: "polygon",
    }),
    {
      jobId: "job-001",
      jobTitle: "Harbour update",
      objectId: 12,
      geometryType: "polygon",
    }
  );
});

test("normalizeSelectedJob falls back to id and title aliases", () => {
  assert.deepEqual(
    normalizeSelectedJob({
      id: "job-002",
      title: "Depth review",
    }),
    {
      jobId: "job-002",
      jobTitle: "Depth review",
      objectId: null,
      geometryType: "",
    }
  );
});

test("createSelectedJobStore stores and clears selected Job state", () => {
  const store = createSelectedJobStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  const selectedJob = store.selectJob({
    jobId: "job-003",
    jobTitle: "Navigation warning",
    objectId: 7,
    geometryType: "point",
  });

  assert.equal(selectedJob.jobId, "job-003");
  assert.equal(store.getSnapshot().selectedJob.jobId, "job-003");

  store.clearSelection();

  assert.equal(store.getSnapshot().selectedJob, null);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
