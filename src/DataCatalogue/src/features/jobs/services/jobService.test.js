import assert from "node:assert/strict";
import test from "node:test";

import { createJobService } from "./jobService.js";

test("createJobService wraps injected adapter load results in API result objects", async () => {
  const jobs = [
    {
      id: "job-001",
      relatedAoiIds: ["aoi-001"],
    },
  ];
  const service = createJobService({
    adapter: {
      source: "test-adapter",
      async loadJobs() {
        return {
          jobs,
        };
      },
      async updateJobStatus() {
        return {
          job: jobs[0],
          createdJobs: [],
        };
      },
    },
  });

  const result = await service.loadJobs();

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    jobs,
  });
  assert.equal(result.meta.source, "test-adapter");
});

test("createJobService wraps injected adapter mutation results in API result objects", async () => {
  const service = createJobService({
    adapter: {
      source: "test-adapter",
      async loadJobs() {
        return {
          jobs: [],
        };
      },
      async updateJobStatus(jobId, status) {
        return {
          job: {
            id: jobId,
            status,
            relatedAoiIds: [],
          },
          createdJobs: [
            {
              id: "job-created",
              status: "todo",
              relatedAoiIds: [],
            },
          ],
        };
      },
    },
  });

  const result = await service.updateJobStatus("job-001", "done");

  assert.equal(result.ok, true);
  assert.equal(result.data.job.id, "job-001");
  assert.equal(result.data.job.status, "done");
  assert.equal(result.data.createdJobs.length, 1);
  assert.equal(result.meta.source, "test-adapter");
  assert.equal(result.meta.jobId, "job-001");
});

test("createJobService normalizes adapter failures", async () => {
  const service = createJobService({
    adapter: {
      source: "failing-adapter",
      loadJobs() {
        throw {
          name: "JobServiceTestError",
          message: "Raw load failure",
          userMessage: "Jobs could not be loaded.",
          status: 503,
          code: "JOB_LOAD_FAILED",
        };
      },
      async updateJobStatus() {
        return {
          job: null,
          createdJobs: [],
        };
      },
    },
  });

  const result = await service.loadJobs();

  assert.equal(result.ok, false);
  assert.equal(result.error.name, "JobServiceTestError");
  assert.equal(result.error.message, "Jobs could not be loaded.");
  assert.equal(result.error.status, 503);
  assert.equal(result.error.code, "JOB_LOAD_FAILED");
  assert.equal(result.meta.source, "failing-adapter");
});

test("createJobService rejects incomplete adapters", () => {
  assert.throws(
    () =>
      createJobService({
        adapter: {
          loadJobs() {},
        },
      }),
    /updateJobStatus\(\)/
  );
});
