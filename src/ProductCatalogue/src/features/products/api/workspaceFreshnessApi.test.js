import assert from "node:assert/strict";
import test from "node:test";
import { fetchWorkspaceFreshness } from "./workspaceFreshnessApi.js";

test("workspace freshness sends unique repeated datasetNames and normalizes the response", async () => {
  const calls = [];
  const items = await fetchWorkspaceFreshness([" 101DK001 ", "101dk001", "DK3ABC"], {
    get: async (path, errorMessage) => {
      calls.push({ path, errorMessage });
      return {
        Data: [
          { DatasetName: "101DK001", Revision: "v1:abc", Available: true },
          { datasetName: "DK3ABC", revision: null, available: false },
        ],
      };
    },
  });

  assert.deepEqual(calls, [
    {
      path: "electronicproducts/workspace/freshness?datasetNames=101DK001&datasetNames=DK3ABC",
      errorMessage: "Workspace freshness could not be checked",
    },
  ]);
  assert.deepEqual(items, [
    { datasetName: "101DK001", revision: "v1:abc", available: true },
    { datasetName: "DK3ABC", revision: null, available: false },
  ]);
});

test("workspace freshness avoids backend calls for an empty Product set", async () => {
  let calls = 0;
  const items = await fetchWorkspaceFreshness(["", "   ", null], {
    get: async () => {
      calls += 1;
      return [];
    },
  });

  assert.deepEqual(items, []);
  assert.equal(calls, 0);
});

test("workspace freshness rejects malformed envelopes", async () => {
  await assert.rejects(
    () => fetchWorkspaceFreshness(["101DK001"], { get: async () => ({ Data: {} }) }),
    /Invalid workspace freshness response/
  );
});

test("workspace freshness rejects incomplete or duplicate Product results", async () => {
  await assert.rejects(
    () =>
      fetchWorkspaceFreshness(["101DK001", "101DK002"], {
        get: async () => ({
          Data: [{ DatasetName: "101DK001", Revision: "v1:a", Available: true }],
        }),
      }),
    /Invalid workspace freshness response/
  );

  await assert.rejects(
    () =>
      fetchWorkspaceFreshness(["101DK001"], {
        get: async () => ({
          Data: [
            { DatasetName: "101DK001", Revision: "v1:a", Available: true },
            { DatasetName: "101dk001", Revision: "v1:b", Available: true },
          ],
        }),
      }),
    /Invalid workspace freshness response/
  );
});

test("workspace freshness splits large workspaces into bounded backend requests", async () => {
  const names = Array.from({ length: 51 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
  const calls = [];

  const items = await fetchWorkspaceFreshness(names, {
    get: async (path) => {
      calls.push(path);
      const requestUrl = new URL(`https://example.test/${path}`);
      const requestedNames = requestUrl.searchParams.getAll("datasetNames");
      return {
        Data: requestedNames.map((datasetName) => ({
          DatasetName: datasetName,
          Revision: `v1:${datasetName}`,
          Available: true,
        })),
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(
    new URL(`https://example.test/${calls[0]}`).searchParams.getAll("datasetNames").length,
    50
  );
  assert.equal(
    new URL(`https://example.test/${calls[1]}`).searchParams.getAll("datasetNames").length,
    1
  );
  assert.equal(items.length, 51);
});
