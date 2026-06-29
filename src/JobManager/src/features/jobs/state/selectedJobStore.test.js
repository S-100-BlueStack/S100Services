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
      priority: "high",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}", "{AOI-1}"],
    }),
    {
      jobId: "job-001",
      jobTitle: "Harbour update",
      objectId: 12,
      geometryType: "polygon",
      priority: "high",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
    }
  );
});

test("normalizeSelectedJob parses serialized related AOI ids", () => {
  assert.deepEqual(
    normalizeSelectedJob({
      id: "job-002",
      title: "Depth review",
      relatedAoiIds: '["{AOI-1}","{AOI-2}"]',
    }),
    {
      jobId: "job-002",
      jobTitle: "Depth review",
      objectId: null,
      geometryType: "",
      priority: "",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
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
    priority: "",
    relatedAoiIds: ["{AOI-3}"],
  });

  assert.equal(selectedJob.jobId, "job-003");
  assert.deepEqual(store.getSnapshot().selectedJob.relatedAoiIds, ["{AOI-3}"]);

  store.clearSelection();

  assert.equal(store.getSnapshot().selectedJob, null);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
