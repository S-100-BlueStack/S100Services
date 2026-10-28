import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest } from "./apiClient.js";

test("non-2xx ProblemDetails responses are classified as API failures", async () => {
  const previousFetch = globalThis.fetch;
  const problemDetails = {
    title: "An error occurred while processing your request.",
    status: 500,
    instance: "/jobs/active",
  };

  globalThis.fetch = async () =>
    createJsonResponse({
      status: 500,
      statusText: "Internal Server Error",
      contentType: "application/problem+json; charset=utf-8",
      body: problemDetails,
    });

  try {
    const result = await apiRequest("jobs/active?datasetName=101DK001");

    assert.equal(result.success, false);
    assert.equal(result.status, 500);
    assert.equal(result.statusText, "Internal Server Error");
    assert.deepEqual(result.data, problemDetails);
    assert.equal(result.networkError, undefined);
  } finally {
    restoreGlobal("fetch", previousFetch);
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
