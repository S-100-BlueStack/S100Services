import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAoiJobSummaries,
  buildAoiJobSummaryByAoiId,
  getAoiJobSummary,
  toAoiModelJobSummary,
} from "./aoiJobSummary.js";
import {
  buildRelationsFromJobs,
  getAoiIdsForJob,
  getJobIdsForAoi,
  RELATION_SOURCE,
} from "./relationModel.js";

const JOBS = Object.freeze([
  {
    id: "job-001",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["aoi-001", "aoi-002", "aoi-002"],
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
  {
    id: "job-004",
    status: "todo",
    priority: "low",
    relatedAoiIds: [],
  },
]);

test("buildRelationsFromJobs creates normalized mock relations from Job AOI ids", () => {
  const relations = buildRelationsFromJobs(JOBS, { source: RELATION_SOURCE.MOCK });

  assert.deepEqual(relations, [
    {
      jobId: "job-001",
      aoiIds: ["aoi-001", "aoi-002"],
      source: "mock",
    },
    {
      jobId: "job-002",
      aoiIds: ["aoi-001"],
      source: "mock",
    },
    {
      jobId: "job-003",
      aoiIds: ["aoi-001"],
      source: "mock",
    },
  ]);
});

test("relation lookup works from both Job and AOI direction", () => {
  const relations = buildRelationsFromJobs(JOBS);

  assert.deepEqual(getAoiIdsForJob({ relations, jobId: "job-001" }), ["aoi-001", "aoi-002"]);
  assert.deepEqual(getJobIdsForAoi({ relations, aoiId: "aoi-001" }), [
    "job-001",
    "job-002",
    "job-003",
  ]);
});

test("buildAoiJobSummaries derives total, active and high priority Job counts", () => {
  const relations = buildRelationsFromJobs(JOBS);
  const summaries = buildAoiJobSummaries({ jobs: JOBS, relations });
  const summaryByAoiId = buildAoiJobSummaryByAoiId({ jobs: JOBS, relations });

  assert.deepEqual(summaries, [
    {
      aoiId: "aoi-001",
      total: 3,
      active: 2,
      highPriority: 2,
      activeHighPriority: 1,
      jobIds: ["job-001", "job-002", "job-003"],
    },
    {
      aoiId: "aoi-002",
      total: 1,
      active: 1,
      highPriority: 1,
      activeHighPriority: 1,
      jobIds: ["job-001"],
    },
  ]);
  assert.deepEqual(toAoiModelJobSummary(summaryByAoiId.get("aoi-001")), {
    total: 3,
    active: 2,
    highPriority: 2,
  });
});

test("getAoiJobSummary supports plain object snapshots returned by relation services", () => {
  const summary = getAoiJobSummary(
    {
      "aoi-001": {
        aoiId: "aoi-001",
        total: 3,
        active: 2,
        highPriority: 2,
        activeHighPriority: 1,
        jobIds: ["job-001", "job-002", "job-002"],
      },
    },
    "aoi-001"
  );

  assert.deepEqual(summary, {
    aoiId: "aoi-001",
    total: 3,
    active: 2,
    highPriority: 2,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002"],
  });
});

test("getAoiJobSummary returns an empty summary when an AOI has no matching Jobs", () => {
  assert.deepEqual(getAoiJobSummary({}, "aoi-missing"), {
    aoiId: "aoi-missing",
    total: 0,
    active: 0,
    highPriority: 0,
    activeHighPriority: 0,
    jobIds: [],
  });
});
