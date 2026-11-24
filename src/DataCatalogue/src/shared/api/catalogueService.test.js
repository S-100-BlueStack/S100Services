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
  assert.equal(requests[0].path, "/v1/pipelines/pipe%2Fa/workspaces/work%20space/packages");
  const bindings = await service.bindings("p");
  assert.equal(bindings[0].workspaces[0].pipelineId, "q");
  await assert.rejects(service.bindings("other"), /inconsistent/);
  await service.unbind("p::q");
  assert.equal(requests.at(-1).path, "/v1/dispatcher/bindings/p%3A%3Aq");
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
  assert.equal(captured.path, "/v1/pipelines/pipe%2Fa/workspaces/work%20space");
  assert.equal(captured.options.signal, controller.signal);
  assert.equal(detail.workspace.pipelineId, "pipe/a");
  assert.equal(detail.esriJSON, esriJSON);
  await assert.rejects(service.workspace("pipe/a", "other"), /different Workspace/);
});

test("live Package pages expose authoritative Pipeline assignment summaries", async () => {
  const service = createCatalogueService({
    request: async () =>
      page([
        {
          id: "p1",
          hasPipeline: true,
          pipelineBindings: [{ id: "p1::ENC", pipelineId: "ENC" }],
        },
        { id: "p2", hasPipeline: false, pipelineBindings: [] },
        { id: "p3" },
      ]),
  });
  const result = await service.packages();
  assert.deepEqual(
    result.items.map((item) => [item.status, item.pipelineIds]),
    [
      ["Assigned", ["ENC"]],
      ["Not assigned", []],
      [null, null],
    ]
  );
});

test("paged Package AOI uses the geometry route without detail reads or fabricated features", async () => {
  const calls = [];
  const aoi = {
    rings: [
      [
        [10, 54],
        [11, 54],
        [11, 55],
        [10, 55],
        [10, 54],
      ],
    ],
    spatialReference: { wkid: 4326 },
  };
  const service = createCatalogueService({
    async request(path, options) {
      calls.push({ path, options });
      return page([{ packageId: "p", shortId: "NM", aoi }]);
    },
  });
  const result = await service.packageGeometries({ page: 0, pageSize: 200 });
  assert.equal(calls[0].path, "/v1/packages/geometry");
  assert.equal(calls[0].options.query.includeDetails, false);
  assert.equal(calls[0].options.query.pageSize, 200);
  assert.equal(result.items[0].packageId, "p");
  assert.deepEqual(result.items[0].aoi, aoi);
});

test("Workspace overview uses bounded Pipeline pages and preserves nullable components", async () => {
  const calls = [];
  const abort = new AbortController();
  const service = createCatalogueService({
    async request(path, options) {
      calls.push({ path, options });
      return {
        page: 2,
        pageSize: 20,
        totalCount: 21,
        items: [
          {
            workspace: { id: "work space", displayName: "North", geometryRef: { globalId: "g" } },
            esriJSON: null,
            packages: { page: 1, pageSize: 200, totalCount: 0, items: [] },
          },
        ],
      };
    },
  });
  const result = await service.workspaceOverview({
    pipelineId: "pipe/a",
    page: 1,
    signal: abort.signal,
  });
  assert.equal(calls[0].path, "/v1/pipelines/pipe%2Fa/workspaces/overview");
  assert.deepEqual(calls[0].options.query, { page: 2, pageSize: 20 });
  assert.equal(calls[0].options.signal, abort.signal);
  assert.equal(result.page, 1);
  assert.equal(result.total, 21);
  assert.equal(result.items[0].workspace.key, JSON.stringify(["pipe/a", "work space"]));
  assert.equal(result.items[0].workspace.geometryRef.globalId, "g");
  assert.equal(result.items[0].esriJSON, null);
  assert.deepEqual(result.items[0].packages, { items: [], page: 0, pageSize: 200, total: 0 });
  await assert.rejects(service.workspaceOverview({ pipelineId: "p", pageSize: 21 }), /pageSize/);
});

test("Workspace overview rejects missing or malformed components instead of empty data", async () => {
  let row;
  const service = createCatalogueService({
    async request() {
      return { items: [row], page: 1, pageSize: 20, totalCount: 1 };
    },
  });
  for (const invalid of [
    { workspace: { id: "w" }, packages: null },
    { workspace: { id: "w" }, esriJSON: null },
    { workspace: { id: "w" }, esriJSON: [], packages: null },
    {
      workspace: { id: "w" },
      esriJSON: null,
      packages: { items: [], page: 2, pageSize: 200, totalCount: 0 },
    },
    {
      workspace: { id: "w" },
      esriJSON: null,
      packages: { items: [{}], page: 1, pageSize: 200, totalCount: 1 },
    },
  ]) {
    row = invalid;
    await assert.rejects(service.workspaceOverview({ pipelineId: "p" }));
  }
  row = { workspace: { id: "w" }, esriJSON: null, packages: null };
  assert.equal((await service.workspaceOverview({ pipelineId: "p" })).items[0].packages, null);
});

test("collectPages continues after the embedded membership page without rereading page one", async () => {
  const calls = [];
  const first = {
    page: 0,
    pageSize: 200,
    total: 201,
    items: Array.from({ length: 200 }, (_, i) => ({ packageId: `pkg-${i}` })),
  };
  const result = await collectPages(
    async ({ page, pageSize }) => {
      calls.push({ page, pageSize });
      return { page, pageSize: 200, total: 201, items: [{ packageId: "pkg-200" }] };
    },
    { initialPage: first }
  );
  assert.equal(result.length, 201);
  assert.deepEqual(calls, [{ page: 1, pageSize: 200 }]);
  await assert.rejects(
    collectPages(
      async ({ page }) => ({
        page,
        pageSize: 200,
        total: 201,
        items: [{ packageId: "pkg-0" }],
      }),
      { initialPage: first }
    ),
    /Duplicate/
  );
  await assert.rejects(
    collectPages(
      async ({ page }) => ({
        page,
        pageSize: 200,
        total: 202,
        items: [{ packageId: "pkg-200" }],
      }),
      { initialPage: first }
    ),
    /changed/
  );
});


test("Workstream presentation leaves Pipeline wire contracts intact", async () => {
  const pipelineId = "Pipeline ID / 42";
  const packageId = "Package ID / 7";
  const requests = [];
  const service = createCatalogueService({
    request: async (path, options) => {
      requests.push({ path, options });
      if (path === "/v1/pipelines")
        return page([{ id: pipelineId, displayName: "Pipeline Survey" }]);
      return null;
    },
  });
  assert.deepEqual(await service.pipelines(), [
    { id: pipelineId, name: "Pipeline Survey", description: null, layerIds: [] },
  ]);
  await service.bind(packageId, pipelineId);
  await service.unbind("Pipeline binding / 42");
  assert.deepEqual(requests, [
    { path: "/v1/pipelines", options: { signal: undefined } },
    {
      path: "/v1/dispatcher/bindings",
      options: { method: "POST", signal: undefined, body: { packageId, pipelineId } },
    },
    {
      path: "/v1/dispatcher/bindings/Pipeline%20binding%20%2F%2042",
      options: { method: "DELETE", signal: undefined },
    },
  ]);
});

test("Incomplete Pipeline catalogue fails with application-owned Workstream wording", async () => {
  const service = createCatalogueService({
    request: async () => page([{ id: "pipe", displayName: "Pipeline Survey" }], 2),
  });
  await assert.rejects(service.pipelines(), { message: "Workstream catalogue is incomplete." });
});
