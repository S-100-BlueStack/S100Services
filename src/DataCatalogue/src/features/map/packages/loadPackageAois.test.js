import test from "node:test";
import assert from "node:assert/strict";
import { loadPackageAois } from "./loadPackageAois.js";

function entry(number) {
  return { packageId: `p-${number}`, shortId: `NM-${number}`, aoi: { rings: [] } };
}

test("Package AOIs require a selected Pipeline and only read its assigned geometry", async () => {
  await assert.rejects(loadPackageAois({ packageGeometries() {} }), /Select a Workstream/);
  const calls = [];
  const items = await loadPackageAois(
    {
      async packageGeometries(args) {
        calls.push(args);
        return { page: 0, total: 1, items: [entry(1)] };
      },
    },
    { pipelineId: "enc" }
  );
  assert.equal(items.length, 1);
  assert.deepEqual(
    calls.map(({ page, pageSize, pipelineId, hasPipeline }) => [
      page,
      pageSize,
      pipelineId,
      hasPipeline,
    ]),
    [[0, 200, "enc", true]]
  );
});

test("Pipeline-specific Package AOI paging collects 201 assigned features in two requests", async () => {
  const pages = [];
  const items = await loadPackageAois(
    {
      async packageGeometries({ page, pageSize, pipelineId, hasPipeline }) {
        pages.push([page, pageSize, pipelineId, hasPipeline]);
        return {
          page,
          total: 201,
          items: page ? [entry(200)] : Array.from({ length: 200 }, (_, i) => entry(i)),
        };
      },
    },
    { pipelineId: "paper" }
  );
  assert.equal(items.length, 201);
  assert.deepEqual(pages, [
    [0, 200, "paper", true],
    [1, 200, "paper", true],
  ]);
});

test("Pipeline Package AOI paging rejects inconsistent totals, duplicates, missing pages and caps", async () => {
  const cases = [
    async ({ page }) => ({ page, total: page ? 3 : 2, items: [entry(page)] }),
    async ({ page }) => ({ page, total: 2, items: [entry(1)] }),
    async ({ page }) => ({ page, total: 2, items: page ? [] : [entry(1)] }),
    async ({ page }) => ({ page, total: 5001, items: [entry(1)] }),
  ];
  for (const fn of cases) {
    await assert.rejects(loadPackageAois({ packageGeometries: fn }, { pipelineId: "enc" }));
  }
});

test("An aborted Pipeline AOI read does not fetch another page", async () => {
  const abort = new AbortController();
  let calls = 0;
  await assert.rejects(
    loadPackageAois(
      {
        async packageGeometries({ page }) {
          calls++;
          if (!page) abort.abort();
          return { page, total: 2, items: [entry(page)] };
        },
      },
      { pipelineId: "enc", signal: abort.signal }
    ),
    (error) => error.name === "AbortError"
  );
  assert.equal(calls, 1);
});

test("multiple Pipelines are queried independently and overlapping Packages are deduplicated", async () => {
  const calls = [];
  const result = await loadPackageAois(
    {
      async packageGeometries(args) {
        calls.push(args);
        const packages =
          args.pipelineId === "enc" ? ["shared", "enc-only"] : ["shared", "paper-only"];
        return { page: 0, total: 2, items: packages.map((packageId) => ({ packageId, aoi: {} })) };
      },
    },
    { pipelineIds: ["enc", "paper", "enc"] }
  );
  assert.deepEqual(
    result.map((item) => item.packageId),
    ["shared", "enc-only", "paper-only"]
  );
  assert.deepEqual(
    calls.map(({ pipelineId, hasPipeline, pageSize }) => [pipelineId, hasPipeline, pageSize]),
    [
      ["enc", true, 200],
      ["paper", true, 200],
    ]
  );
});

test("a multi-Pipeline AOI read respects the union cap and does not continue after failure", async () => {
  const calls = [];
  await assert.rejects(
    loadPackageAois(
      {
        async packageGeometries({ pipelineId }) {
          calls.push(pipelineId);
          return {
            page: 0,
            total: 2,
            items: [
              { packageId: `${pipelineId}-1`, aoi: {} },
              { packageId: `${pipelineId}-2`, aoi: {} },
            ],
          };
        },
      },
      { pipelineIds: ["enc", "paper"], maxPackages: 3 }
    ),
    /exceeds 3 distinct Packages/
  );
  assert.deepEqual(calls, ["enc", "paper"]);
});
