import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultJobFilters,
  filterJobs,
  filterJobsForVisibleJobSet,
  getActiveJobFilterSummary,
  hasActiveJobFilters,
  normalizeJobFilters,
  shouldRevealDoneJobsForFilters,
} from "./jobFilters.js";

const JOBS = Object.freeze([
  {
    id: "job-1",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["{AOI-1}"],
  },
  {
    id: "job-2",
    status: "inProgress",
    priority: "medium",
    relatedAoiIds: [],
  },
  {
    id: "job-3",
    status: "done",
    priority: "high",
    relatedAoiIds: ["{AOI-2}"],
  },
]);

test("createDefaultJobFilters creates an inactive filter state", () => {
  const filters = createDefaultJobFilters();

  assert.equal(hasActiveJobFilters(filters), false);
  assert.deepEqual(filters.statusValues, []);
  assert.deepEqual(filters.priorityValues, []);
});

test("normalizeJobFilters removes invalid status and priority values", () => {
  assert.deepEqual(
    normalizeJobFilters({
      activeOnly: true,
      statusValues: ["todo", "unknown", "done", "todo"],
      priorityValues: ["high", "bad-value"],
    }),
    {
      activeOnly: true,
      highPriorityOnly: false,
      withRelatedAoisOnly: false,
      statusValues: ["todo", "done"],
      priorityValues: ["high"],
    }
  );
});

test("normalizeJobFilters handles nullish filter input", () => {
  assert.deepEqual(normalizeJobFilters(null), createDefaultJobFilters());
});

test("filterJobs applies quick filters and explicit multi-select filters", () => {
  assert.deepEqual(
    filterJobs(JOBS, {
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }).map((job) => job.id),
    ["job-1"]
  );

  assert.deepEqual(
    filterJobs(JOBS, {
      statusValues: ["done"],
      priorityValues: ["high"],
    }).map((job) => job.id),
    ["job-3"]
  );
});

test("filterJobsForVisibleJobSet hides Done Jobs by default", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS).map((job) => job.id),
    ["job-1", "job-2"]
  );
});

test("filterJobsForVisibleJobSet reveals Done Jobs for explicit Done status filter", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS, {
      statusValues: ["done"],
    }).map((job) => job.id),
    ["job-3"]
  );
});

test("filterJobsForVisibleJobSet keeps contradictory Active and Done filters empty", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS, {
      activeOnly: true,
      statusValues: ["done"],
    }).map((job) => job.id),
    []
  );
});

test("shouldRevealDoneJobsForFilters only reveals Done Jobs for explicit Done status filter", () => {
  assert.equal(
    shouldRevealDoneJobsForFilters({
      statusValues: ["done"],
    }),
    true
  );

  assert.equal(
    shouldRevealDoneJobsForFilters({
      activeOnly: true,
    }),
    false
  );

  assert.equal(
    shouldRevealDoneJobsForFilters({
      priorityValues: ["high"],
    }),
    false
  );
});

test("getActiveJobFilterSummary describes active filters", () => {
  assert.equal(
    getActiveJobFilterSummary({
      activeOnly: true,
      priorityValues: ["high", "medium"],
    }),
    "Active Jobs, 2 priority filter"
  );
});
