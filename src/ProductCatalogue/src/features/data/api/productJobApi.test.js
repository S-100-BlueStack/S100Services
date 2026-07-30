import assert from "node:assert/strict";
import test from "node:test";

import { buildActiveProductJobsPath, buildProductJobStatusPath } from "./productJobApi.js";

test("job status path URL encodes the Hangfire job id", () => {
  assert.equal(buildProductJobStatusPath("job/123?"), "jobs/job%2F123%3F");
});

test("active jobs path URL encodes the dataset name", () => {
  assert.equal(
    buildActiveProductJobsPath("101 DK/001?"),
    "jobs/active?datasetName=101+DK%2F001%3F"
  );
});
