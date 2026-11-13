import test from "node:test";
import assert from "node:assert/strict";
import { loadLivePackageMetadata } from "./loadLivePackageMetadata.js";
import { createLiveJobServiceAdapter } from "./liveJobServiceAdapter.js";
import { createCatalogueService } from "../../../shared/api/catalogueService.js";

const ids = (length) => Array.from({ length }, (_, index) => `pkg-${index}`);
const packageItem = (id) => ({ id, severity: "18446744073709551614", title: `Title ${id}` });
const page = (items, total, pageSize) => ({ items, total, page: 0, pageSize });
const membership = (values) => ({
  page: 0,
  pageSize: 200,
  total: values.length,
  items: values.map((packageId) => ({ packageId, shortId: packageId })),
});

function catalogueFixture({ assignedIds, allIds = assignedIds } = {}) {
  const calls = [];
  const catalog = {
    calls,
    async packages(options) {
      calls.push({ kind: "list", ...options });
      return page(
        allIds.slice(0, options.pageSize).map(packageItem),
        allIds.length,
        options.pageSize
      );
    },
    async package(id, options) {
      calls.push({ kind: "detail", id, signal: options.signal });
      return packageItem(id);
    },
  };
  return catalog;
}

test("empty membership does not call the API", async () => {
  const catalogue = catalogueFixture({ assignedIds: [] });
  assert.equal((await loadLivePackageMetadata(catalogue, [])).size, 0);
  assert.deepEqual(catalogue.calls, []);
});

test("small membership keeps targeted reads without a catalogue probe", async () => {
  const selected = ids(11);
  const catalogue = catalogueFixture({ assignedIds: selected });
  const result = await loadLivePackageMetadata(catalogue, [...selected, selected[0]]);
  assert.equal(result.size, 11);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 11);
  assert.equal(catalogue.calls.filter((call) => call.kind === "list").length, 0);
});

test("bounded assigned Package summary uses two requests instead of 30 targeted reads", async () => {
  const selected = ids(30);
  const catalogue = catalogueFixture({ assignedIds: selected, allIds: ids(60) });
  const result = await loadLivePackageMetadata(catalogue, [...selected, "pkg-0"]);
  assert.equal(result.size, 30);
  assert.deepEqual(
    catalogue.calls.map((call) => [call.kind, call.pageSize, call.hasPipeline]),
    [
      ["list", 1, true],
      ["list", 60, true],
    ]
  );
  assert.equal(result.get("pkg-29").severity, "18446744073709551614");
});

test("large assigned catalogue does not download 200 unrelated descriptions", async () => {
  const selected = ids(30);
  const catalogue = catalogueFixture({ assignedIds: selected, allIds: ids(500) });
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.size, selected.length);
  assert.deepEqual(
    catalogue.calls.filter((call) => call.kind === "list").map((c) => c.pageSize),
    [1]
  );
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, selected.length);
});

test("more than one bulk page of member IDs skips the summary probe entirely", async () => {
  const selected = ids(201);
  const catalogue = catalogueFixture({ assignedIds: selected });
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.size, 201);
  assert.equal(catalogue.calls.filter((call) => call.kind === "list").length, 0);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 201);
});

test("targeted fallback never exceeds six concurrent metadata reads", async () => {
  const selected = ids(90);
  let active = 0;
  let peak = 0;
  const catalogue = {
    async package(id) {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return packageItem(id);
    },
  };
  assert.equal((await loadLivePackageMetadata(catalogue, selected)).size, 90);
  assert.equal(peak, 6);
});

test("a repeated read always uses fresh metadata without a cross-refresh cache", async () => {
  const selected = ids(20);
  const catalogue = catalogueFixture({ assignedIds: selected });
  await loadLivePackageMetadata(catalogue, selected);
  await loadLivePackageMetadata(catalogue, selected);
  assert.equal(catalogue.calls.filter((call) => call.kind === "list").length, 4);
});

test("an undercounted subscription projection falls back to exact Package reads", async () => {
  const selected = ids(15);
  const catalogue = catalogueFixture({ assignedIds: selected, allIds: ids(10) });
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.size, 15);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 15);
});

test("missing membership in a complete summary falls back without mixing metadata sources", async () => {
  const selected = ids(12);
  const catalogue = catalogueFixture({ assignedIds: selected, allIds: [...ids(11), "unrelated"] });
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.size, 12);
  assert.equal(catalogue.calls.filter((call) => call.kind === "list").length, 2);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 12);
});

test("a changing summary count reuses only targeted metadata, never a mixed page", async () => {
  const selected = ids(16);
  const catalogue = catalogueFixture({ assignedIds: selected });
  let reads = 0;
  catalogue.packages = async ({ pageSize }) => {
    reads++;
    return page(
      ids(reads === 1 ? 16 : 17)
        .slice(0, pageSize)
        .map(packageItem),
      reads === 1 ? 16 : 17,
      pageSize
    );
  };
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.size, 16);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 16);
});

test("invalid duplicate or missing list identities fail closed", async () => {
  const selected = ids(12);
  const catalogue = catalogueFixture({ assignedIds: selected });
  catalogue.packages = async ({ pageSize }) =>
    page(
      pageSize === 1 ? [packageItem(selected[0])] : Array(12).fill(packageItem(selected[0])),
      12,
      pageSize
    );
  await assert.rejects(loadLivePackageMetadata(catalogue, selected), /duplicate identifier/);
});

test("invalid first-page shape fails rather than inventing an empty Package list", async () => {
  const catalogue = catalogueFixture({ assignedIds: ids(12) });
  catalogue.packages = async () => page([], 12, 1);
  await assert.rejects(loadLivePackageMetadata(catalogue, ids(12)), /inconsistent first page/);
});

test("a failed optional list request cannot publish a successful empty catalogue", async () => {
  const catalogue = catalogueFixture({ assignedIds: ids(12) });
  catalogue.packages = async () => {
    throw new Error("Catalogue unavailable");
  };
  await assert.rejects(loadLivePackageMetadata(catalogue, ids(12)), /Catalogue unavailable/);
});

test("aborted summary probing never falls through to targeted reads", async () => {
  const selected = ids(20);
  const controller = new AbortController();
  const catalogue = catalogueFixture({ assignedIds: selected });
  catalogue.packages = async () => {
    controller.abort();
    return page([packageItem(selected[0])], selected.length, 1);
  };
  await assert.rejects(
    loadLivePackageMetadata(catalogue, selected, { signal: controller.signal }),
    {
      name: "AbortError",
    }
  );
  assert.deepEqual(catalogue.calls, []);
});

test("an abort during the full summary page cannot publish stale metadata", async () => {
  const selected = ids(20);
  const controller = new AbortController();
  const catalogue = catalogueFixture({ assignedIds: selected });
  catalogue.packages = async ({ pageSize }) => {
    if (pageSize > 1) controller.abort();
    return page(selected.slice(0, pageSize).map(packageItem), selected.length, pageSize);
  };
  await assert.rejects(
    loadLivePackageMetadata(catalogue, selected, { signal: controller.signal }),
    {
      name: "AbortError",
    }
  );
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 0);
});

test("real catalogue normalization and paging preserve exact Severity and assigned filtering", async () => {
  const selected = ids(24);
  const requests = [];
  const catalogue = createCatalogueService({
    async request(path, { query }) {
      requests.push({ path, ...query });
      assert.equal(path, "/v1/packages");
      assert.equal(query.hasPipeline, true);
      return {
        items: selected.slice(0, query.pageSize).map((id) => ({
          id,
          severity: "18446744073709551614",
          metaData: { shortId: id, title: `Title ${id}` },
          hasPipeline: true,
          pipelineBindings: [{ id: `${id}-binding`, pipelineId: "enc" }],
        })),
        totalCount: selected.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  });
  const result = await loadLivePackageMetadata(catalogue, selected);
  assert.equal(result.get("pkg-3").severity, "18446744073709551614");
  assert.equal(result.get("pkg-3").title, "Title pkg-3");
  assert.deepEqual(result.get("pkg-3").pipelineIds, ["enc"]);
  assert.equal(result.get("pkg-3").status, "Assigned");
  assert.deepEqual(
    requests.map((request) => request.pageSize),
    [1, 24]
  );
});

test("bulk metadata hydration retains each Workspace's temporary Job status on reload", async () => {
  const selected = ids(20);
  const catalogue = catalogueFixture({ assignedIds: selected });
  catalogue.workspacePackages = async () => membership(selected);
  const adapter = createLiveJobServiceAdapter({ catalogue });
  const workspace = { pipelineId: "enc", workspaceId: "east", pipelineName: "ENC", name: "East" };
  adapter.setWorkspaces([workspace]);
  const first = await adapter.loadJobs();
  await adapter.updateJobStatus(first.jobs[0].id, "done");
  adapter.setWorkspaces([workspace]);
  const second = await adapter.loadJobs();
  assert.equal(second.jobs[0].status, "done");
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 0);
});

test("summary hydration preserves separate Jobs for a Package shared across Workspaces", async () => {
  const selected = ids(20);
  const catalogue = catalogueFixture({ assignedIds: selected });
  catalogue.workspacePackages = async (_pipelineId, _workspaceId) => membership(selected);
  const adapter = createLiveJobServiceAdapter({ catalogue });
  adapter.setWorkspaces([
    { pipelineId: "enc", workspaceId: "west", pipelineName: "ENC", name: "West" },
    { pipelineId: "enc", workspaceId: "east", pipelineName: "ENC", name: "East" },
  ]);
  const result = await adapter.loadJobs();
  assert.equal(result.jobs.length, 40);
  assert.equal(result.jobs.filter((job) => job.packageId === "pkg-0").length, 2);
  assert.equal(catalogue.calls.filter((call) => call.kind === "list").length, 2);
  assert.equal(catalogue.calls.filter((call) => call.kind === "detail").length, 0);
});
