import assert from "node:assert/strict";
import test from "node:test";

import { loadAoiJobRelationSnapshot } from "./relationService.js";

const JOBS = Object.freeze([
  {
    id: "job-001",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["aoi-001", "aoi-002"],
  },
  {
    id: "job-002",
    status: "inProgress",
    priority: "medium",
    relatedAoiIds: ["aoi-001"],
  },
  {
    id: "job-003",
    status: "done",
    priority: "high",
    relatedAoiIds: ["aoi-001"],
  },
]);

test("loadAoiJobRelationSnapshot preserves existing unfiltered behavior when no Job filters are provided", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 3,
    active: 2,
    highPriority: 2,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002", "job-003"],
  });
});

test("loadAoiJobRelationSnapshot hides Done Jobs when default Job filters are provided", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 2,
    active: 2,
    highPriority: 1,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002"],
  });
});

test("loadAoiJobRelationSnapshot applies explicit Job filters before building AOI summaries", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {
      highPriorityOnly: true,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 1,
    active: 1,
    highPriority: 1,
    activeHighPriority: 1,
    jobIds: ["job-001"],
  });
});

test("loadAoiJobRelationSnapshot reveals Done Jobs for explicit Done status filter", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {
      statusValues: ["done"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 1,
    active: 0,
    highPriority: 1,
    activeHighPriority: 0,
    jobIds: ["job-003"],
  });
});
