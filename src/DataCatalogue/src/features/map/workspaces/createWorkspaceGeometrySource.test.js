import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceGeometrySource } from "./createWorkspaceGeometrySource.js";

const polygon = JSON.stringify({
  rings: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 0],
    ],
  ],
  spatialReference: { wkid: 4326 },
});
const scope = (pipelineId = "p", workspaceId = "w") => ({
  pipelineId,
  workspaceId,
  name: workspaceId,
});
const detail = (pipelineId, workspaceId) => ({
  workspace: scope(pipelineId, workspaceId),
  esriJSON: polygon,
});

test("Geometry reads deduplicate a batch and isolate Pipeline identities without a stale data cache", async () => {
  const calls = [];
  const source = createWorkspaceGeometrySource({
    catalogue: {
      workspace: async (p, w) => {
        calls.push([p, w]);
        return detail(p, w);
      },
    },
  });
  const results = await source.load([scope(), scope(), scope("q")]);
  assert.equal(results.length, 2);
  assert.deepEqual(calls, [
    ["p", "w"],
    ["q", "w"],
  ]);
  await source.load([scope()]);
  assert.equal(calls.length, 3);
});

test("Geometry hydration has bounded concurrency and scopes individual API errors", async () => {
  let active = 0;
  let maximum = 0;
  const source = createWorkspaceGeometrySource({
    concurrency: 3,
    catalogue: {
      workspace: async (p, w) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise(setImmediate);
        active--;
        if (w === "4") throw new Error("403 Forbidden");
        return detail(p, w);
      },
    },
  });
  const results = await source.load(Array.from({ length: 12 }, (_, i) => scope("p", String(i))));
  assert.equal(maximum, 3);
  assert.equal(results.filter((r) => !r.error).length, 11);
  assert.equal(results[4].error.message, "403 Forbidden");
});

test("Abort stops queued reads even if an active transport ignores cancellation", async () => {
  const abort = new AbortController();
  let finish;
  let calls = 0;
  const source = createWorkspaceGeometrySource({
    concurrency: 1,
    catalogue: {
      workspace: (p, w, { signal }) => {
        calls++;
        assert.equal(signal.aborted, false);
        return new Promise((resolve) => {
          finish = () => resolve(detail(p, w));
        });
      },
    },
  });
  const read = source.load([scope(), scope("q")], { signal: abort.signal });
  abort.abort();
  finish();
  await assert.rejects(read, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("Mismatched Workspace identity, changed reference and invalid polygons are isolated failures", async () => {
  for (const value of [
    detail("other", "w"),
    detail("p", "other"),
    { ...detail("p", "w"), esriJSON: null },
  ]) {
    const source = createWorkspaceGeometrySource({ catalogue: { workspace: async () => value } });
    assert.ok((await source.load([scope()]))[0].error);
  }
  const source = createWorkspaceGeometrySource({
    catalogue: {
      workspace: async () => ({
        ...detail("p", "w"),
        workspace: { ...scope(), geometryRef: { globalId: "new" } },
      }),
    },
  });
  const [result] = await source.load([{ ...scope(), geometryRef: { globalId: "old" } }]);
  assert.match(result.error.message, /reference changed/);
});

test("A timed-out Workspace fails locally and queued Workspaces can still load", async () => {
  const source = createWorkspaceGeometrySource({
    concurrency: 1,
    requestTimeoutMs: 5,
    catalogue: {
      workspace: (p, w, { signal }) => {
        if (w !== "w") return Promise.resolve(detail(p, w));
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        );
      },
    },
  });
  const results = await source.load([scope(), scope("p", "next")]);
  assert.match(results[0].error.message, /timed out/);
  assert.equal(results[1].error, null);
});
