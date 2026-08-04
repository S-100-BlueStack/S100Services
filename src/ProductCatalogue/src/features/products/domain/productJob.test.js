import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_JOB_OPERATION,
  createProductJobActionResult,
  createProductJobCompletionTitle,
  createProductJobRecord,
  isSendToIcEncOperation,
  isTerminalProductJobStatus,
  normalizeStoredProductJob,
} from "./productJob.js";

test("accepted export job response is normalized for persistent tracking", () => {
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
    mode: null,
    deliveryStatus: null,
  });
});

test("accepted simulation job preserves truthful mode and delivery status", () => {
  const record = createProductJobRecord({
    response: {
      jobId: "job-send",
      datasetName: "101DK0040943E",
      operationType: "SendToIcEnc",
      status: "Queued",
      createdAt: "2026-08-03T08:00:00Z",
      mode: "Simulation",
      deliveryStatus: "NotDelivered",
    },
    operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
  });
  assert.equal(record.mode, "Simulation");
  assert.equal(record.deliveryStatus, "NotDelivered");
  assert.equal(record.label, "Simulating IC-ENC send");
  assert.equal(
    createProductJobRecord({
      response: {
        ...record,
        operationType: PRODUCT_JOB_OPERATION.EXPORT_EDITION,
      },
      operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
    }),
    null
  );
});

test("invalid stored jobs are ignored", () => {
  assert.equal(normalizeStoredProductJob(null), null);
  assert.equal(normalizeStoredProductJob({ datasetName: "101DK0040943E" }), null);
  assert.equal(
    normalizeStoredProductJob({
      jobId: "job-send-invalid",
      datasetName: "101DK0040943E",
      operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
      mode: "Simulation",
      deliveryStatus: "Delivered",
    }),
    null
  );
});

test("terminal status detection is case insensitive", () => {
  assert.equal(isTerminalProductJobStatus("Succeeded"), true);
  assert.equal(isTerminalProductJobStatus("failed"), true);
  assert.equal(isTerminalProductJobStatus("CANCELLED"), true);
  assert.equal(isTerminalProductJobStatus("Running"), false);
  assert.equal(isTerminalProductJobStatus("Queued"), false);
});

test("succeeded export job remains a successful product action result", () => {
  const response = {
    jobId: "job-123",
    operationType: "Rollback",
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

test("truthful terminal simulation result is successful but not delivered", () => {
  const response = {
    jobId: "job-send",
    operationType: "SendToIcEnc",
    status: "Succeeded",
    mode: "Simulation",
    operationOutcome: "SimulationCompleted",
    deliveryStatus: "NotDelivered",
    message: "Simulation completed. No data was sent to IC-ENC.",
  };
  const result = createProductJobActionResult(response);
  assert.equal(result.success, true);
  assert.equal(result.data.deliveryStatus, "NotDelivered");
  assert.match(result.data.message, /no data was sent/i);
  assert.doesNotMatch(result.data.message, /sent successfully/i);
});

test("delivered or incomplete simulation result is rejected as false success", () => {
  for (const response of [
    {
      operationType: "SendToIcEnc",
      status: "Succeeded",
      mode: "Simulation",
      operationOutcome: "SimulationCompleted",
      deliveryStatus: "Delivered",
      message: "Sent successfully",
    },
    {
      operationType: "SendToIcEnc",
      status: "Succeeded",
      mode: "Simulation",
      deliveryStatus: "NotDelivered",
      message: "Simulation completed.",
    },
    {
      operationType: "SendToIcEnc",
      status: "Succeeded",
      mode: "Simulation",
      operationOutcome: "SimulationCompleted",
      deliveryStatus: "NotDelivered",
      message: "No data was sent successfully.",
    },
  ]) {
    const result = createProductJobActionResult(response);
    assert.equal(result.success, false);
    assert.equal(result.data.code, "SEND_SIMULATION_RESULT_INVALID");
  }
});

test("terminal job status cannot change the accepted operation type", () => {
  const result = createProductJobActionResult(
    {
      jobId: "job-send",
      operationType: PRODUCT_JOB_OPERATION.EXPORT_EDITION,
      status: "Succeeded",
      message: "Export completed.",
    },
    { expectedOperationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC }
  );

  assert.equal(result.success, false);
  assert.equal(result.data.code, "JOB_STATUS_INVALID");
  assert.doesNotMatch(result.data.message, /completed successfully|delivered/i);
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
  assert.equal(result.data.message, "The product version changed before the operation started.");
});

test("operation rejection exposes the backend-owned safe message", () => {
  const result = createProductJobActionResult({
    jobId: "job-123",
    status: "Failed",
    error: {
      code: "PRODUCT_OPERATION_REJECTED",
      message: "A New edition could not be created now. Current product state: Exported.",
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.data.code, "PRODUCT_OPERATION_REJECTED");
  assert.equal(
    result.data.message,
    "A New edition could not be created now. Current product state: Exported."
  );
});

test("simulation completion titles never claim delivery", () => {
  const title = createProductJobCompletionTitle(
    { datasetName: "101DK001", operationType: "SendToIcEnc" },
    { status: "Succeeded" }
  );
  assert.equal(title, "IC-ENC send simulation completed for 101DK001");
  assert.equal(isSendToIcEncOperation("sendtoicenc"), true);
  assert.doesNotMatch(title, /delivered|sent successfully/i);
});
