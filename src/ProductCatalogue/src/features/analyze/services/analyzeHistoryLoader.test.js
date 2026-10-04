import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
} from "../../products/domain/productContext.js";
import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import { loadAnalyzeProductHistories } from "./analyzeHistoryLoader.js";

function createSourceContext(sourceId, sourceLabel, datasetName) {
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

function createHistoryFetcher(get) {
  return (datasetName, options) => fetchProductHistory(datasetName, { ...options, get });
}

test("compatibility Analyze Product History uses explicit context and compatibility endpoint", async () => {
  const productContext = createCompatibilityWorkspaceProductContext("AOI-1");
  const requests = [];
  const result = await loadAnalyzeProductHistories(
    [{ datasetName: "AOI-1", workspaceLoadState: "loaded", productContext }],
    {
      fetchHistory: createHistoryFetcher(async (...args) => {
        requests.push(args);
        return { Data: [] };
      }),
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "electronicproducts/AOI-1/history");
  assert.equal(result[0].history.endpointAvailable, true);
  assert.equal(result[0].historyError, null);
});

test("Paper Charts Analyze Product History is unavailable with zero compatibility requests", async () => {
  let requests = 0;
  const productContext = createSourceContext("paper-charts", "Paper Charts", "PAPER-1");
  const result = await loadAnalyzeProductHistories(
    [{ datasetName: "PAPER-1", workspaceLoadState: "loaded", productContext }],
    {
      fetchHistory: createHistoryFetcher(async () => {
        requests += 1;
        return { Data: [] };
      }),
    }
  );

  assert.equal(requests, 0);
  assert.equal(result[0].history.endpointAvailable, false);
  assert.equal(result[0].history.source, "unavailable");
  assert.match(result[0].history.availabilityReason, /Paper Charts/);
});

test("S-102 Analyze Product History is unavailable with zero compatibility requests", async () => {
  let requests = 0;
  const productContext = createSourceContext("s102", "S-102", "S102-1");
  const result = await loadAnalyzeProductHistories(
    [{ datasetName: "S102-1", workspaceLoadState: "loaded", productContext }],
    {
      fetchHistory: createHistoryFetcher(async () => {
        requests += 1;
        return { Data: [] };
      }),
    }
  );

  assert.equal(requests, 0);
  assert.equal(result[0].history.endpointAvailable, false);
  assert.equal(result[0].history.source, "unavailable");
  assert.match(result[0].history.availabilityReason, /S-102/);
});

test("failed Analyze Product resolution cannot fall through to compatibility History", async () => {
  let historyCalls = 0;
  const result = await loadAnalyzeProductHistories(
    [
      {
        datasetName: "UNKNOWN-1",
        workspaceLoadState: "failed",
        productContext: null,
        loadError: "Workspace resolution failed.",
      },
    ],
    {
      fetchHistory: async () => {
        historyCalls += 1;
      },
    }
  );

  assert.equal(historyCalls, 0);
  assert.equal(result[0].history, null);
  assert.equal(result[0].historyError, "Workspace resolution failed.");
});
