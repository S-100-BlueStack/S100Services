import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueService } from "./catalogueService.js";
import { loadWorkspaceOverview } from "./loadWorkspaceOverview.js";
import { createLiveJobServiceAdapter } from "../../features/jobs/services/liveJobServiceAdapter.js";
import { createWorkspaceGeometrySource } from "../../features/map/workspaces/createWorkspaceGeometrySource.js";

const polygon = JSON.stringify({
  rings: [
    [
      [10, 54],
      [11, 54],
      [11, 55],
      [10, 54],
    ],
  ],
  spatialReference: { wkid: 4326 },
});
const response = (items, page = 1, pageSize = 20, totalCount = items.length) => ({
  items,
  page,
  pageSize,
  totalCount,
});
const overviewRow = (pipeline, index, members = []) => ({
  workspace: { id: `${pipeline}-w${index}`, displayName: `Workspace ${index}` },
  esriJSON: polygon,
  packages: response(members, 1, 200),
});

test("two overview requests hydrate 33 Workspace polygons and initial scoped Jobs without legacy reads", async () => {
  const calls = [];
  const service = createCatalogueService({
    async request(path, { query } = {}) {
      calls.push({ path, query });
      if (path === "/v1/pipelines")
        return response(
          [
            { id: "enc", displayName: "ENC" },
            { id: "paper", displayName: "Paper Chart" },
          ],
          1,
          25
        );
      if (path.endsWith("/workspaces/overview")) {
        const pipeline = path.split("/")[3];
        const count = pipeline === "enc" ? 15 : 18;
        return response(
          Array.from({ length: count }, (_, index) =>
            overviewRow(
              pipeline,
              index,
              index === 0 ? [{ packageId: `pkg-${pipeline}`, shortId: `NM-${pipeline}` }] : []
            )
          ),
          query.page,
          query.pageSize
        );
      }
      if (path.startsWith("/v1/packages/")) {
        const id = decodeURIComponent(path.slice("/v1/packages/".length));
        return { id, metaData: { shortId: id }, severity: "0" };
      }
      throw new Error(`Unexpected legacy route: ${path}`);
    },
  });
  const snapshot = await loadWorkspaceOverview(service);
  assert.equal(snapshot.workspaces.length, 33);
  assert.equal(snapshot.overview.size, 33);
  assert.equal(
    snapshot.workspaces.find((w) => w.pipelineId === "paper").pipelineName,
    "Paper Chart"
  );
  const source = createWorkspaceGeometrySource({
    catalogue: service,
    getOverview: () => snapshot.overview,
  });
  const geometry = await source.load(snapshot.workspaces);
  assert.equal(geometry.length, 33);
  assert.ok(geometry.every((row) => !row.error && row.polygon.spatialReference.wkid === 4326));
  const adapter = createLiveJobServiceAdapter({ catalogue: service });
  adapter.setWorkspaces(snapshot.workspaces, { overview: snapshot.overview });
  const { jobs } = await adapter.loadJobs();
  assert.equal(jobs.length, 2);
  assert.deepEqual(new Set(jobs.map((job) => job.pipelineId)), new Set(["enc", "paper"]));
  assert.equal(calls.filter(({ path }) => path.endsWith("/workspaces/overview")).length, 2);
  assert.equal(calls.filter(({ path }) => path === "/v1/workspaces").length, 0);
  assert.equal(
    calls.filter(
      ({ path }) => /\/workspaces\/[^/]+(?:\/packages)?$/.test(path) && !path.endsWith("/overview")
    ).length,
    0
  );
});

test("Workspace overview collects additional bounded pages with independent Pipeline identities", async () => {
  const counts = new Map([
    ["enc", 21],
    ["paper", 3],
  ]);
  const calls = [];
  const catalogue = {
    async pipelines() {
      return [...counts.keys()].map((id) => ({ id, name: id }));
    },
    async workspaceOverview({ pipelineId, page, pageSize, signal }) {
      signal?.throwIfAborted();
      calls.push([pipelineId, page, pageSize]);
      const total = counts.get(pipelineId);
      const start = page * pageSize;
      return {
        items: Array.from(
          { length: Math.max(0, Math.min(pageSize, total - start)) },
          (_, index) => ({
            workspace: { pipelineId, workspaceId: `w${start + index}` },
            esriJSON: polygon,
            packages: null,
          })
        ),
        page,
        pageSize,
        total,
      };
    },
  };
  const result = await loadWorkspaceOverview(catalogue);
  assert.equal(result.workspaces.length, 24);
  assert.equal(result.overview.get(JSON.stringify(["enc", "w20"])).workspace.workspaceId, "w20");
  assert.deepEqual(
    calls.filter(([id]) => id === "enc").map(([, page]) => page),
    [0, 1]
  );
  assert.deepEqual(
    calls.filter(([id]) => id === "paper").map(([, page]) => page),
    [0]
  );
});

test("Workspace overview rejects duplicates, changing totals and incomplete pages", async () => {
  for (const scenario of ["duplicate", "total", "incomplete", "cross-pipeline"]) {
    const catalogue = {
      async pipelines() {
        return [{ id: "enc", name: "ENC" }];
      },
      async workspaceOverview({ page }) {
        if (page === 0) {
          const items = Array.from({ length: 20 }, (_, index) => ({
            workspace: { pipelineId: "enc", workspaceId: `w${index}` },
            esriJSON: polygon,
            packages: null,
          }));
          if (scenario === "cross-pipeline") items[0].workspace.pipelineId = "paper";
          return { items, page: 0, pageSize: 20, total: 21 };
        }
        if (scenario === "incomplete") return { items: [], page, pageSize: 20, total: 21 };
        return {
          items: [
            {
              workspace: {
                pipelineId: "enc",
                workspaceId: scenario === "duplicate" ? "w0" : "w20",
              },
              esriJSON: polygon,
              packages: null,
            },
          ],
          page,
          pageSize: 20,
          total: scenario === "total" ? 22 : 21,
        };
      },
    };
    await assert.rejects(
      loadWorkspaceOverview(catalogue),
      /duplicate|changed|complete|different Pipeline/
    );
  }
});

test("aborted overview cannot publish even if its transport ignores cancellation", async () => {
  let resume;
  const pending = new Promise((resolve) => {
    resume = resolve;
  });
  const controller = new AbortController();
  const catalogue = {
    async pipelines() {
      return [{ id: "enc", name: "ENC" }];
    },
    async workspaceOverview() {
      await pending;
      return {
        page: 0,
        pageSize: 20,
        total: 1,
        items: [
          { workspace: { pipelineId: "enc", workspaceId: "w" }, esriJSON: polygon, packages: null },
        ],
      };
    },
  };
  const operation = loadWorkspaceOverview(catalogue, { signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  resume();
  await assert.rejects(operation, { name: "AbortError" });
});

test("unavailable overview route fails explicitly without silently reading the legacy Workspace list", async () => {
  let legacyReads = 0;
  const catalogue = {
    async pipelines() {
      return [{ id: "enc", name: "ENC" }];
    },
    async workspaceOverview() {
      throw new Error("API request failed (HTTP 404).");
    },
    async workspaces() {
      legacyReads++;
      return { items: [], page: 0, pageSize: 200, total: 0 };
    },
  };
  await assert.rejects(loadWorkspaceOverview(catalogue), /404/);
  assert.equal(legacyReads, 0);
});
