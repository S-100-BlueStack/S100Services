import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActiveProductJobsPath,
  buildProductJobStatusPath,
  getActiveProductJobs,
} from "./productJobApi.js";

test("job status path URL encodes the Hangfire job id", () => {
  assert.equal(buildProductJobStatusPath("job/123?"), "jobs/job%2F123%3F");
});

test("active jobs path URL encodes the dataset name", () => {
  assert.equal(
    buildActiveProductJobsPath("101 DK/001?"),
    "jobs/active?datasetName=101+DK%2F001%3F"
  );
});

test("active jobs lookup preserves a non-2xx ProblemDetails failure", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const problemDetails = {
    title: "An error occurred while processing your request.",
    status: 500,
    instance: "/jobs/active",
  };

  globalThis.window = {
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (timeoutId) => globalThis.clearTimeout(timeoutId),
  };
  globalThis.fetch = async () =>
    createJsonResponse({
      status: 500,
      statusText: "Internal Server Error",
      contentType: "application/problem+json",
      body: problemDetails,
    });

  try {
    const result = await getActiveProductJobs("101DK001");

    assert.equal(result.success, false);
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, problemDetails);
  } finally {
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("window", previousWindow);
  }
});

function createJsonResponse({ status, statusText, contentType, body }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function restoreGlobal(name, previousValue) {
  if (previousValue === undefined) {
    delete globalThis[name];
    return;
  }

  globalThis[name] = previousValue;
}
