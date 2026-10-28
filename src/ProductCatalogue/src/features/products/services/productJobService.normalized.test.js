import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeActiveProductJobs } from "./productJobService.js";

function setup() {
  const original = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = {
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {} },
  };
  return () => {
    globalThis.window = original.window;
    globalThis.fetch = original.fetch;
  };
}
const json = (value) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

test("active-job preflight rejects malformed arrays and unverifiable product identity", async () => {
  const restore = setup();
  try {
    for (const payload of [
      { Data: [] },
      [{}],
      [{ jobId: "1", operationType: "ExportUpdate" }],
      [{ jobId: "1", datasetName: "OTHER", operationType: "ExportEdition" }],
    ]) {
      globalThis.fetch = async () => json(payload);
      assert.equal((await synchronizeActiveProductJobs("PRODUCT")).success, false);
    }
  } finally {
    restore();
  }
});

test("concurrent active-job verification for one Product is coalesced", async () => {
  const restore = setup();
  let completeRequest;
  let fetchCalls = 0;
  try {
    globalThis.fetch = () => {
      fetchCalls++;
      return new Promise((resolve) => {
        completeRequest = resolve;
      });
    };

    const watcherRequest = synchronizeActiveProductJobs("PRODUCT");
    const mutationPreflight = synchronizeActiveProductJobs("product");

    assert.equal(fetchCalls, 1);
    assert.strictEqual(mutationPreflight, watcherRequest);

    completeRequest(json([]));
    const [watcherResult, preflightResult] = await Promise.all([watcherRequest, mutationPreflight]);

    assert.equal(watcherResult.success, true);
    assert.equal(preflightResult.success, true);
    assert.deepEqual(watcherResult.data, []);
    assert.deepEqual(preflightResult.data, []);
  } finally {
    restore();
  }
});

test("a completed active-job verification does not suppress the next fresh request", async () => {
  const restore = setup();
  let fetchCalls = 0;
  try {
    globalThis.fetch = async () => {
      fetchCalls++;
      return json([]);
    };

    assert.equal((await synchronizeActiveProductJobs("PRODUCT")).success, true);
    assert.equal((await synchronizeActiveProductJobs("PRODUCT")).success, true);
    assert.equal(fetchCalls, 2);
  } finally {
    restore();
  }
});
