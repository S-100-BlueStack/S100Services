import assert from "node:assert/strict";
import test from "node:test";

const STORAGE_KEY = "productCatalogue.activeProductJobs.v1";

function installBrowserStubs() {
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalFetch = globalThis.fetch;

  globalThis.window = {
    localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener() {},
  };
  globalThis.document = {
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    visibilityState: "visible",
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };

  return {
    localStorage,
    restore() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.CustomEvent = originalCustomEvent;
      globalThis.fetch = originalFetch;
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("accepted simulation blocks mutations until truthful terminal polling completes", async () => {
  const browser = installBrowserStubs();
  const datasetName = "101DK_PC006_SUCCESS";

  try {
    const [{ runProductJob }, { PRODUCT_JOB_OPERATION }, operationState, availabilityDomain] =
      await Promise.all([
        import("./productJobService.js"),
        import("../domain/productJob.js"),
        import("../state/productOperationState.js"),
        import("../domain/productActionAvailability.js"),
      ]);

    let acceptedState = null;
    globalThis.fetch = async () =>
      jsonResponse({
        jobId: "job-pc006-success",
        datasetName,
        operationType: "SendToIcEnc",
        status: "Succeeded",
        mode: "Simulation",
        operationOutcome: "SimulationCompleted",
        deliveryStatus: "NotDelivered",
        message: "Simulation completed. No data was sent to IC-ENC.",
        correlationId: "correlation-pc006",
      });

    const result = await runProductJob({
      datasetName,
      operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
      label: "Simulating IC-ENC send",
      startJob: async () => ({
        success: true,
        status: 202,
        data: {
          jobId: "job-pc006-success",
          datasetName,
          operationType: "SendToIcEnc",
          status: "Queued",
          createdAt: "2026-08-03T08:00:00Z",
          correlationId: "correlation-pc006",
          statusUrl: "/jobs/job-pc006-success",
          mode: "Simulation",
          deliveryStatus: "NotDelivered",
          message: "IC-ENC send simulation was accepted. No data will be delivered.",
        },
      }),
      onAccepted() {
        acceptedState = operationState.getProductOperationState(datasetName);
        const availability = availabilityDomain.createProductActionAvailability({
          attributes: { datasetName, status: "Exported" },
          productHasRunningMutation: acceptedState.running,
          productOperationDisabledReason: acceptedState.disabledReason,
          sendToIcEncCapability: {
            mode: "Simulation",
            available: true,
          },
        });

        assert.equal(acceptedState.running, true);
        assert.equal(acceptedState.operations[0].type, operationState.PRODUCT_OPERATION_TYPE.SEND);
        assert.equal(availability.freeze.disabled, true);
        assert.equal(availability.sendImmediately.disabled, true);
        assert.equal(availability.rollback.disabled, true);
        assert.equal(availability.exportRoot.disabled, true);
      },
    });

    assert.ok(acceptedState);
    assert.equal(result.success, true);
    assert.equal(result.data.deliveryStatus, "NotDelivered");
    assert.match(result.data.message, /no data was sent/i);
    assert.doesNotMatch(result.data.message, /sent successfully/i);
    assert.equal(operationState.getProductOperationState(datasetName).running, false);
    assert.deepEqual(JSON.parse(browser.localStorage.getItem(STORAGE_KEY) ?? "[]"), []);
  } finally {
    browser.restore();
  }
});

test("safe backend failure clears loading state without creating a success result", async () => {
  const browser = installBrowserStubs();
  const datasetName = "101DK_PC006_FAILURE";

  try {
    const [{ runProductJob }, { PRODUCT_JOB_OPERATION }, operationState] = await Promise.all([
      import("./productJobService.js"),
      import("../domain/productJob.js"),
      import("../state/productOperationState.js"),
    ]);

    globalThis.fetch = async () =>
      jsonResponse({
        jobId: "job-pc006-failure",
        datasetName,
        operationType: "SendToIcEnc",
        status: "Failed",
        mode: "Simulation",
        deliveryStatus: "NotDelivered",
        correlationId: "correlation-pc006",
        error: {
          code: "PRODUCT_VERSION_CHANGED",
          message: "The product changed after the job was created.",
        },
      });

    const result = await runProductJob({
      datasetName,
      operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
      startJob: async () => ({
        success: true,
        status: 202,
        data: {
          jobId: "job-pc006-failure",
          datasetName,
          operationType: "SendToIcEnc",
          status: "Queued",
          createdAt: "2026-08-03T08:00:00Z",
          correlationId: "correlation-pc006",
          mode: "Simulation",
          deliveryStatus: "NotDelivered",
        },
      }),
    });

    assert.equal(result.success, false);
    assert.equal(result.data.code, "PRODUCT_VERSION_CHANGED");
    assert.equal(result.data.message, "The product changed after the job was created.");
    assert.equal(operationState.getProductOperationState(datasetName).running, false);
    assert.deepEqual(JSON.parse(browser.localStorage.getItem(STORAGE_KEY) ?? "[]"), []);
  } finally {
    browser.restore();
  }
});
