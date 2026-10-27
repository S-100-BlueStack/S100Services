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

test("a successful HTTP response with invalid JSON is not reported as successful empty data", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ...createJsonResponse({ status: 200, contentType: "application/json", body: null }),
    async json() {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  });

  try {
    const result = await apiRequest("electronicproducts/dashboard");
    assert.equal(result.success, false);
    assert.equal(result.networkError, true);
    assert.equal(result.aborted, false);
    assert.match(result.errorMessage, /Unexpected end of JSON input/);
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});

test("a successful HTTP response with a failed text body read is a failure", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ...createJsonResponse({ status: 200, contentType: "text/plain", body: null }),
    async text() {
      throw new Error("Body stream failed");
    },
  });

  try {
    const result = await apiRequest("health");
    assert.equal(result.success, false);
    assert.match(result.errorMessage, /Body stream failed/);
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});

test("HTTP 204 still succeeds without reading a body", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ...createJsonResponse({ status: 204, contentType: "application/json", body: null }),
    async json() {
      throw new Error("204 must not attempt a body read");
    },
  });

  try {
    const result = await apiRequest("empty-operation");
    assert.deepEqual(result, { success: true, status: 204, data: null });
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});

test("non-2xx responses preserve the HTTP status if reading the error body fails", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ...createJsonResponse({
      status: 503,
      statusText: "Service Unavailable",
      contentType: "application/problem+json",
      body: null,
    }),
    async json() {
      throw new SyntaxError("Malformed error payload");
    },
  });

  try {
    const result = await apiRequest("jobs/active");
    assert.equal(result.success, false);
    assert.equal(result.status, 503);
    assert.equal(result.data, null);
    assert.equal(result.networkError, undefined);
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});

test("an external abort during successful response body reading is classified as cancelled", async () => {
  const previousFetch = globalThis.fetch;
  const controller = new AbortController();
  let rejectBody;
  globalThis.fetch = async () => ({
    ...createJsonResponse({ status: 200, contentType: "application/json", body: null }),
    json() {
      return new Promise((_, reject) => {
        rejectBody = reject;
      });
    },
  });

  try {
    const pending = apiRequest("electronicproducts/dashboard", { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    rejectBody(new Error("Body read cancelled"));
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.errorMessage, "Request was cancelled.");
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});

test("a timeout during response body reading retains the timeout classification", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  let fireTimeout;
  globalThis.window = {
    setTimeout(callback) {
      fireTimeout = callback;
      return 1;
    },
    clearTimeout() {},
  };
  globalThis.fetch = async (_, { signal }) => ({
    ...createJsonResponse({ status: 200, contentType: "application/json", body: null }),
    json() {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Body read aborted")), {
          once: true,
        });
      });
    },
  });

  try {
    const pending = apiRequest("electronicproducts/dashboard", { timeoutMs: 1500 });
    await new Promise((resolve) => setImmediate(resolve));
    fireTimeout();
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, true);
    assert.equal(result.errorMessage, "Request timed out after 1500 ms.");
  } finally {
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("window", previousWindow);
  }
});

test("a body that resolves after cancellation cannot publish a successful response", async () => {
  const previousFetch = globalThis.fetch;
  const controller = new AbortController();
  let completeBody;
  globalThis.fetch = async () => ({
    ...createJsonResponse({ status: 200, contentType: "application/json", body: null }),
    json() {
      return new Promise((resolve) => {
        completeBody = resolve;
      });
    },
  });

  try {
    const pending = apiRequest("electronicproducts/dashboard", { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    completeBody({ Success: true, Data: { Activities: [] } });
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(result.aborted, true);
  } finally {
    restoreGlobal("fetch", previousFetch);
  }
});
