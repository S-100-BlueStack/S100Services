import assert from "node:assert/strict";
import test from "node:test";

import { fetchProductHistory } from "./productHistoryApi.js";
import {
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
} from "../../products/domain/productContext.js";

function unavailableContext(sourceId, sourceLabel, datasetName) {
  return createWorkspaceProductContext({
    sourceId,
    sourceLabel,
    productKey: datasetName,
    datasetName,
    productType: `${sourceId}-product`,
    capabilities: { history: true },
    contentConfiguration: {
      history: {
        visible: true,
        implemented: false,
        loaderId: null,
        availabilityReason: `Product History is not available for ${sourceLabel} yet.`,
      },
    },
  });
}

function createBackendPayload(datasetName) {
  return {
    Timestamp: "2026-08-07T10:00:00Z",
    Data: [
      {
        Name: datasetName,
        Status: 4,
        From: "2026-08-07T09:00:00Z",
        To: "9999-12-31T23:59:59Z",
        Owner: "test-user",
        Edition: 2,
        Update: 1,
      },
    ],
  };
}

test("legacy compatibility History calls backend directly without workspace resolution", async () => {
  const getCalls = [];
  let resolverCalls = 0;
  const history = await fetchProductHistory("AOI-1", {
    get: async (...args) => {
      getCalls.push(args);
      return createBackendPayload("AOI-1");
    },
    workspaceProductService: {
      async resolveProduct() {
        resolverCalls += 1;
        throw new Error("Legacy History must not resolve workspace catalog.");
      },
    },
  });

  assert.equal(resolverCalls, 0);
  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0][0], "electronicproducts/AOI-1/history");
  assert.equal(history.endpointAvailable, true);
  assert.equal(history.source, "backend");
  assert.equal(history.datasetName, "AOI-1");
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].actor, "test-user");
});

test("explicit compatibility ProductContext keeps the established backend request", async () => {
  const calls = [];
  const history = await fetchProductHistory("AOI-1", {
    productContext: createCompatibilityWorkspaceProductContext("AOI-1"),
    get: async (...args) => {
      calls.push(args);
      return createBackendPayload("AOI-1");
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "electronicproducts/AOI-1/history");
  assert.equal(history.endpointAvailable, true);
});

test("Paper Charts History is unavailable without compatibility API request", async () => {
  let calls = 0;
  const history = await fetchProductHistory("PAPER-1", {
    productContext: unavailableContext("paper-charts", "Paper Charts", "PAPER-1"),
    get: async () => {
      calls += 1;
      return createBackendPayload("PAPER-1");
    },
  });

  assert.equal(calls, 0);
  assert.equal(history.endpointAvailable, false);
  assert.equal(history.source, "unavailable");
  assert.equal(history.sourceId, "paper-charts");
  assert.match(history.availabilityReason, /Paper Charts/);
});

test("S-102 History is unavailable without compatibility API request", async () => {
  let calls = 0;
  const history = await fetchProductHistory("S102-1", {
    productContext: unavailableContext("s102", "S-102", "S102-1"),
    get: async () => {
      calls += 1;
      return createBackendPayload("S102-1");
    },
  });

  assert.equal(calls, 0);
  assert.equal(history.endpointAvailable, false);
  assert.equal(history.source, "unavailable");
  assert.equal(history.sourceId, "s102");
  assert.match(history.availabilityReason, /S-102/);
});

test("explicit unresolved ProductContext fails closed without compatibility request", async () => {
  let calls = 0;

  await assert.rejects(
    fetchProductHistory("UNKNOWN-1", {
      productContext: null,
      get: async () => {
        calls += 1;
        return createBackendPayload("UNKNOWN-1");
      },
    }),
    /source context could not be resolved/
  );

  assert.equal(calls, 0);
});
