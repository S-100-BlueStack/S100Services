import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_JOB_OPERATION,
  createProductJobActionResult,
  createProductJobRecord,
  isTerminalProductJobStatus,
  normalizeStoredProductJob,
} from "./productJob.js";

test("accepted job response is normalized for persistent tracking", () => {
  const record = createProductJobRecord({
    response: {
      jobId: "job-123",
      datasetName: "101DK0040943E",
      operationType: "ExportEdition",
      exportTarget: "S100",
      status: "Queued",
      createdAt: "2026-07-24T08:00:00Z",
      correlationId: "correlation-123",
      statusUrl: "/jobs/job-123",
    },
    datasetName: "fallback",
    operationType: PRODUCT_JOB_OPERATION.EXPORT_EDITION,
    label: "Exporting S100 Edition",
  });

  assert.deepEqual(record, {
    jobId: "job-123",
    datasetName: "101DK0040943E",
    operationType: "ExportEdition",
    exportTarget: "S100",
    label: "Exporting S100 Edition",
    createdAt: "2026-07-24T08:00:00Z",
    correlationId: "correlation-123",
    statusUrl: "/jobs/job-123",
    status: "Queued",
  });
});

test("invalid stored jobs are ignored", () => {
  assert.equal(normalizeStoredProductJob(null), null);
  assert.equal(
    normalizeStoredProductJob({ datasetName: "101DK0040943E" }),
    null,
  );
});

test("terminal status detection is case insensitive", () => {
  assert.equal(isTerminalProductJobStatus("Succeeded"), true);
  assert.equal(isTerminalProductJobStatus("failed"), true);
  assert.equal(isTerminalProductJobStatus("CANCELLED"), true);
  assert.equal(isTerminalProductJobStatus("Running"), false);
  assert.equal(isTerminalProductJobStatus("Queued"), false);
});

test("succeeded job response becomes a successful product action result", () => {
  const response = {
    jobId: "job-123",
    status: "Succeeded",
    warning: {
      code: "ROLLBACK_CLEANUP_FAILED",
      message: "Cleanup failed after rollback.",
    },
  };

  const result = createProductJobActionResult(response);

  assert.equal(result.success, true);
  assert.equal(result.data, response);
  assert.equal(result.warning.code, "ROLLBACK_CLEANUP_FAILED");
});

test("failed job response exposes the safe backend error", () => {
  const result = createProductJobActionResult({
    jobId: "job-123",
    status: "Failed",
    error: {
      code: "PRODUCT_VERSION_CHANGED",
      message: "The product version changed before the operation started.",
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.data.code, "PRODUCT_VERSION_CHANGED");
  assert.equal(
    result.data.message,
    "The product version changed before the operation started.",
  );
});

test("operation rejection exposes the backend-owned safe message", () => {
  const result = createProductJobActionResult({
    jobId: "job-123",
    status: "Failed",
    error: {
      code: "PRODUCT_OPERATION_REJECTED",
      message:
        "A New edition could not be created now. Current product state: Exported.",
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.data.code, "PRODUCT_OPERATION_REJECTED");
  assert.equal(
    result.data.message,
    "A New edition could not be created now. Current product state: Exported.",
  );
});
