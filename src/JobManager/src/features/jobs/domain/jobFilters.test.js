import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultJobFilters,
  filterJobs,
  getActiveJobFilterSummary,
  hasActiveJobFilters,
  normalizeJobFilters,
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

test("getActiveJobFilterSummary describes active filters", () => {
  assert.equal(
    getActiveJobFilterSummary({
      activeOnly: true,
      priorityValues: ["high", "medium"],
    }),
    "Active Jobs, 2 priority filter"
  );
});
