import test from "node:test";
import assert from "node:assert/strict";
import {
  createCatalogueService,
  collectPages,
  normalizePage,
  normalizePackage,
  normalizeWorkspace,
} from "./catalogueService.js";
import { resolveSourceMode } from "../config/sourceMode.js";

const page = (items, totalCount = items.length) => ({ items, page: 1, pageSize: 25, totalCount });

test("source choice defaults deterministically to mock and rejects unknown modes", () => {
  assert.equal(resolveSourceMode(), "mock");
  assert.equal(resolveSourceMode("live"), "live");
  for (const value of ["http", "LIVE", null, ""]) assert.throws(() => resolveSourceMode(value));
});

test("Package ID, short ID and GlobalID are separate; null fields and source HTML remain data", () => {
  const item = normalizePackage({
    id: "p",
    metaData: { shortId: "NM1000", title: "Notice" },
    geometryRef: { featureClass: "AOI", globalId: "g" },
    severity: "9007199254740993",
    descriptions: [{ language: "da", description: "<script>source</script>" }],
  });
  assert.equal(item.packageId, "p");
  assert.equal(item.shortId, "NM1000");
  assert.equal(item.geometryRef.globalId, "g");
  assert.equal(item.geometry, null);
  assert.equal(item.createdAt, null);
  assert.equal(item.category, null);
  assert.match(item.details, /<script>/);
  assert.equal(item.severity, "9007199254740993");
  assert.throws(() => normalizePackage({}), /identifier/);
});

test("Live Package list identity is shortId and never a Package name or fileName", () => {
  const item = normalizePackage({
    id: "canonical-package-id",
    fileName: "file-name-that-must-not-be-the-label",
    metaData: { shortId: "NM1000", title: "An optional description" },
  });
  assert.equal(item.name, "NM1000");
  assert.equal(item.packageId, "canonical-package-id");
  assert.equal(item.title, "An optional description");
  assert.equal(normalizePackage({ id: "fallback-id", fileName: "wrong" }).name, "fallback-id");
});

test("Workspace ownership is preserved without becoming workflow status", () => {
  const a = normalizeWorkspace({ id: "w", owner: "alice" }, "p");
  const b = normalizeWorkspace({ id: "w", owner: "alice" }, "q");
  assert.notEqual(a.key, b.key);
  assert.equal(a.owner, "alice");
  assert.equal(a.status, undefined);
});

test("package paging converts zero-based UI pages and sends only supported server filters", async () => {
  let captured;
  const service = createCatalogueService({
    request: async (path, options) => {
      captured = { path, options };
      return { ...page([], 0), page: 3 };
    },
  });
  const result = await service.packages({
    page: 2,
    pageSize: 25,
    category: "cat",
    hasPipeline: false,
    pipelineId: "pipe",
  });
  assert.equal(result.page, 2);
  assert.deepEqual(captured.options.query, {
    page: 3,
    pageSize: 25,
    category: "cat",
    hasPipeline: false,
    pipelineId: "pipe",
  });
  assert.equal(result.total, 0);
  await assert.rejects(service.packages({ pageSize: 201 }), /pageSize/);
});

test("malformed or missing pages fail instead of appearing empty", () => {
  for (const value of [
    null,
    [],
    { ...page([]), page: 0 },
    { ...page([]), pageSize: 0 },
    { ...page([]), totalCount: -1 },
    page([{}], 0),
  ])
    assert.throws(() => normalizePage(value));
});

test("collectPages reads all pages and rejects inconsistent totals and repeated identities", async () => {
  assert.deepEqual(
    await collectPages(async ({ page: index }) => ({
      items: [{ id: String(index) }],
      page: index,
      pageSize: 1,
      total: 2,
    })),
    [{ id: "0" }, { id: "1" }]
  );
  await assert.rejects(
    collectPages(async ({ page: index }) => ({
      items: [{ id: "same" }],
      page: index,
      pageSize: 1,
      total: 2,
    })),
    /Duplicate/
  );
  await assert.rejects(
    collectPages(async ({ page: index }) => ({
      items: [{ id: String(index) }],
      page: index,
      pageSize: 1,
      total: index + 2,
    })),
    /changed/
  );
  await assert.rejects(
    collectPages(async () => ({ items: [], page: 0, pageSize: 200, total: 1 })),
    /complete/
  );
});

test("routes encode opaque identifiers and bindings validate package and Pipeline uniqueness", async () => {
  const requests = [];
  const service = createCatalogueService({
    request: async (path, options) => {
      requests.push({ path, options });
      if (path.endsWith("/packages")) return page([{ packageId: "p", shortId: "NM" }]);
      return [{ id: "binding", packageId: "p", pipelineId: "q", workspaces: [{ id: "w" }] }];
    },
  });
  await service.workspacePackages("pipe/a", "work space");
  assert.equal(requests[0].path, "/api/v1/pipelines/pipe%2Fa/workspaces/work%20space/packages");
  const bindings = await service.bindings("p");
  assert.equal(bindings[0].workspaces[0].pipelineId, "q");
  await assert.rejects(service.bindings("other"), /inconsistent/);
  await service.unbind("p::q");
  assert.equal(requests.at(-1).path, "/api/v1/dispatcher/bindings/p%3A%3Aq");
});

test("Workspace detail preserves Esri JSON, validates identity and forwards abort ownership", async () => {
  const controller = new AbortController();
  const esriJSON = '{"rings":[]}';
  let captured;
  const service = createCatalogueService({
    request: async (path, options) => {
      captured = { path, options };
      return { workspace: { id: "work space" }, esriJSON };
    },
  });
  const detail = await service.workspace("pipe/a", "work space", { signal: controller.signal });
  assert.equal(captured.path, "/api/v1/pipelines/pipe%2Fa/workspaces/work%20space");
  assert.equal(captured.options.signal, controller.signal);
  assert.equal(detail.workspace.pipelineId, "pipe/a");
  assert.equal(detail.esriJSON, esriJSON);
  await assert.rejects(service.workspace("pipe/a", "other"), /different Workspace/);
});
