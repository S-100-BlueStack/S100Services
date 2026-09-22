import assert from "node:assert/strict";
import test from "node:test";

import { createJobService } from "./jobService.js";
import { createJobServiceAdapter, JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapter.js";

test("createJobServiceAdapter creates the mock adapter by default", () => {
  const adapter = createJobServiceAdapter();

  assert.equal(adapter.source, JOB_SERVICE_ADAPTER_SOURCE.MOCK);
  assert.equal(typeof adapter.loadJobs, "function");
  assert.equal(typeof adapter.updateJobStatus, "function");
});

test("createJobServiceAdapter creates an unavailable HTTP adapter seam", async () => {
  const adapter = createJobServiceAdapter({
    source: JOB_SERVICE_ADAPTER_SOURCE.HTTP,
  });
  const service = createJobService({ adapter });

  const result = await service.loadJobs();

  assert.equal(adapter.source, JOB_SERVICE_ADAPTER_SOURCE.HTTP);
  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Job backend is not configured yet.");
  assert.equal(result.error.status, 501);
  assert.equal(result.error.code, "JOB_HTTP_ADAPTER_UNAVAILABLE");
  assert.equal(result.meta.source, JOB_SERVICE_ADAPTER_SOURCE.HTTP);
});

test("createJobServiceAdapter rejects unsupported sources", () => {
  assert.throws(
    () =>
      createJobServiceAdapter({
        source: "unsupported",
      }),
    /Unsupported Job service adapter source: unsupported/
  );
});
