import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueClient } from "../../../shared/api/catalogueClient.js";
import { createCatalogueService } from "../../../shared/api/catalogueService.js";
import { loadWorkspaceOverview } from "../../../shared/api/loadWorkspaceOverview.js";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createPackageCommentAvailability } from "./createPackageCommentAvailability.js";
import { JOB_STORE_CHANGE_TYPE, createJobStore } from "../state/jobStore.js";
import { createJobService } from "./jobService.js";
import { createLiveJobServiceAdapter } from "./liveJobServiceAdapter.js";
import { createLiveAssignmentServices } from "../../assignments/services/liveAssignmentServices.js";
import { createAssignmentSession } from "../../assignments/state/createAssignmentSession.js";
import {
  countOpenJobsByWorkspace,
  getVisiblePackageIdsForScope,
} from "../domain/packageScopeFilter.js";
import { loadPackageAois } from "../../map/packages/loadPackageAois.js";

const aoi = {
  rings: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 0],
    ],
  ],
  spatialReference: { wkid: 4326 },
};

function workspace(id, ids = []) {
  return {
    workspace: { id, displayName: id },
    esriJSON: JSON.stringify(aoi),
    packages: page(ids.map(member), 1, 200),
  };
}

function member(packageId) {
  return { packageId, shortId: packageId, aoi };
}

function page(items, number, size, totalCount = items.length) {
  return { items, page: number, pageSize: size, totalCount };
}

function fixture(pipelines, packages = ["shared"]) {
  const calls = [];
  const state = {
    pipelines,
    packages,
    intercept: null,
    continuation: new Map(),
    bindingComments: new Map(),
  };
  const catalogue = createCatalogueService(
    createCatalogueClient({
      baseUrl: "/api",
      async fetchImpl(url, { signal, method, body }) {
        const { pathname, searchParams } = new URL(url, "https://fixture.invalid");
        const number = Number(searchParams.get("page") ?? 1);
        const size = Number(searchParams.get("pageSize") ?? 200);
        const [, , , path, id, subresource, workspaceId, membership] = pathname.split("/");
        if (path === "packages" && id === "binding-comments" && subresource === "availability") {
          assert.equal(method, "POST");
          const { bindings } = JSON.parse(body);
          calls.push({ kind: "availability", bindings });
          return Response.json({
            items: bindings.map(({ packageId, pipelineId }) => ({
              packageId,
              pipelineId,
              hasBindingComments: (state.bindingComments.get(packageId) ?? []).some(
                (comment) => comment.pipelineId === pipelineId
              ),
            })),
          });
        }
        if (path === "packages" && subresource === "binding-comments") {
          calls.push({ kind: "comment", method });
          const items = state.bindingComments.get(id) ?? [];
          if (method === "GET") {
            const pipelineId = searchParams.get("pipelineId");
            if (pipelineId) {
              return Response.json({
                packageId: id,
                pipelineId,
                items: items.filter((item) => item.pipelineId === pipelineId),
                nextBefore: null,
              });
            }
            return Response.json({ packageId: id, items, nextBefore: null });
          }
          const { operationId, pipelineId, text } = JSON.parse(body);
          const item = {
            id: operationId,
            pipelineId,
            text,
            actor: "PROD\\reader",
            occurredAtUtc: "2026-11-26T08:00:00Z",
          };
          state.bindingComments.set(id, [item, ...items]);
          return Response.json(item);
        }
        if (path === "dispatcher") {
          assert.equal(id, "bindings");
          calls.push({ kind: "binding", method });
          if (method === "GET") {
            const packageId = searchParams.get("packageId");
            return Response.json(
              Object.entries(state.pipelines)
                .filter(([, rows]) =>
                  rows.some((row) =>
                    row.packages.items.some((item) => item.packageId === packageId)
                  )
                )
                .map(([pipelineId]) => ({
                  id: pipelineId,
                  packageId,
                  pipelineId,
                  workspaces: [],
                }))
            );
          }
          if (method === "POST") {
            const { pipelineId, packageId } = JSON.parse(body);
            state.pipelines[pipelineId] = state.pipelines[pipelineId].map((row) =>
              workspace(row.workspace.id, [
                ...row.packages.items.map((item) => item.packageId),
                packageId,
              ])
            );
          } else {
            assert.equal(method, "DELETE");
            state.pipelines[subresource] = state.pipelines[subresource].map((row) =>
              workspace(row.workspace.id)
            );
          }
          return new Response(null, { status: 204 });
        }
        let kind;
        if (path === "pipelines") {
          if (!id) kind = "pipeline";
          else if (workspaceId === "overview") kind = "overview";
          else {
            assert.equal(subresource, "workspaces");
            kind = membership === "packages" ? "membership" : "workspaceDetail";
          }
        } else {
          assert.equal(path, "packages");
          if (!id) kind = "metadataList";
          else kind = id === "geometry" ? "geometry" : "metadataDetail";
        }
        const call = { kind, pipelineId: id, workspaceId, number, size, signal };
        calls.push(call);
        const intercepted = await state.intercept?.(call);
        if (intercepted instanceof Response) return intercepted;

        if (kind === "pipeline") {
          return Response.json(
            page(
              Object.keys(state.pipelines).map((id) => ({ id, displayName: id })),
              1,
              200
            )
          );
        }
        if (kind === "overview") {
          const rows = state.pipelines[id];
          return Response.json(
            page(rows.slice((number - 1) * size, number * size), number, size, rows.length)
          );
        }
        if (kind === "membership") {
          const response = state.continuation.get(`${id}/${workspaceId}/${number}`);
          assert.ok(response, `Unexpected individual membership request: ${url}`);
          return Response.json(response);
        }
        if (kind === "geometry") {
          return Response.json(page(state.packages.map(member), number, size));
        }
        const detail = (id) => ({ id, metaData: { title: id }, severity: "9007199254740993" });
        if (kind === "metadataList") {
          return Response.json(
            page(state.packages.slice(0, size).map(detail), number, size, state.packages.length)
          );
        }
        assert.equal(kind, "metadataDetail");
        return Response.json(detail(id));
      },
    })
  );

  let initial;
  const readWorkspaceCatalogue = (options) => loadWorkspaceOverview(catalogue, options);
  const adapter = createLiveJobServiceAdapter({
    catalogue,
    async ensureWorkspaces() {
      initial ??= readWorkspaceCatalogue().then(({ workspaces, overview }) => {
        adapter.setWorkspaces(workspaces, { overview });
        return { ok: true };
      });
      return initial;
    },
    readWorkspaceCatalogue,
  });
  const store = createJobStore({ service: createJobService({ adapter }) });
  const published = [];
  store.subscribe((snapshot, workspaceCatalogue) => {
    if (workspaceCatalogue) published.push({ jobs: snapshot.jobs, ...workspaceCatalogue });
  });

  return {
    catalogue,
    store,
    calls,
    state,
    published,
    newAssignmentSession(onCommentsInvalidated) {
      return createAssignmentSession({
        services: createLiveAssignmentServices(catalogue, {
          onMembershipInvalidated: store.invalidateMembership,
          onCommentsInvalidated,
        }),
      });
    },
  };
}

function summarize(calls) {
  return Object.fromEntries(
    [
      "pipeline",
      "overview",
      "membership",
      "workspaceDetail",
      "metadataList",
      "metadataDetail",
      "geometry",
    ].map((kind) => [kind, calls.filter((call) => call.kind === kind).length])
  );
}

for (const [distribution, expectedPages] of [
  [[10, 10, 9], 3],
  [[100], 5],
  [[200], 10],
  [[21, 1, 0], 4],
]) {
  test(`Fresh Main Map HTTP counts for Workspaces ${distribution.join("/")}`, async (t) => {
    const packageIds = Array.from({ length: 12 }, (_, index) => `package-${index}`);
    const pipelines = Object.fromEntries(
      distribution.map((count, index) => [
        `pipeline-${index}`,
        Array.from({ length: count }, (_, row) =>
          workspace(`workspace-${row}`, row === 0 ? packageIds : [])
        ),
      ])
    );
    const f = fixture(pipelines, packageIds);
    const startup = await f.store.loadJobs();
    assert.equal(startup.ok, true);
    assert.equal(f.published.length, 0, "Startup consumes the shared overview");
    assert.equal(summarize(f.calls).overview, expectedPages);
    assert.equal(summarize(f.calls).membership, 0);

    f.calls.length = 0;
    const result = await f.store.loadJobs({ cancelOnLeave: true });
    assert.equal(result.ok, true);
    assert.equal(
      f.published[0].workspaces.length,
      distribution.reduce((a, b) => a + b)
    );
    const jobs = f.published[0].jobs;
    assert.equal(jobs.length, distribution.filter(Boolean).length * packageIds.length);
    assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
    assert.equal(jobs[0].severity, "9007199254740993");

    // Exercise the separate AOI consumer against the same wire client, once per scoped Pipeline.
    await loadPackageAois(f.catalogue, { pipelineIds: Object.keys(pipelines) });
    const counts = summarize(f.calls);
    assert.deepEqual(counts, {
      pipeline: 1,
      overview: expectedPages,
      membership: 0,
      workspaceDetail: 0,
      metadataList: 2,
      metadataDetail: 0,
      geometry: distribution.length,
    });
    assert.ok(f.calls.filter(({ kind }) => kind === "overview").every(({ size }) => size === 20));
    t.diagnostic(JSON.stringify(counts));
  });
}

test("Fresh loads reconcile bindings, Workspaces and Pipelines", async () => {
  const f = fixture({ enc: [workspace("west", ["shared"]), workspace("east")], paper: [] });
  assert.equal((await f.store.loadJobs()).data.jobs[0].workspaceId, "west");
  const reference = { featureClass: "surface", globalId: "new-ref" };
  const east = workspace("east", ["shared"]);
  east.workspace.geometryRef = reference;
  f.state.pipelines = { enc: [east], new: [workspace("east", ["shared"])] };

  const first = await f.store.loadJobs({ cancelOnLeave: true });
  assert.equal(first.ok, true);
  assert.deepEqual(
    f.published[0].pipelines.map(({ id }) => id),
    ["enc", "new"]
  );
  assert.deepEqual(
    f.published[0].workspaces.map(({ workspaceId }) => workspaceId),
    ["east", "east"]
  );
  assert.deepEqual(f.published[0].workspaces[0].geometryRef, reference);
  assert.deepEqual(
    first.data.jobs.map(({ pipelineId }) => pipelineId),
    ["enc", "new"]
  );

  f.state.pipelines = { enc: [workspace("east")], new: [] };
  const second = await f.store.loadJobs({ cancelOnLeave: true });
  assert.equal(second.ok, true);
  assert.deepEqual(second.data.jobs, []);
  assert.deepEqual(
    f.published.map(({ jobs }) => jobs.length),
    [2, 0]
  );
  assert.equal(summarize(f.calls).pipeline, 3);
  assert.equal(summarize(f.calls).membership, 0);
  assert.equal(summarize(f.calls).metadataDetail, 2, "One hydration per unique ID in each load");
});

test("Overview continues overflow and retries only null membership", async (t) => {
  const f = fixture({ enc: [workspace("start")] });
  await f.store.loadJobs();
  const ids = Array.from({ length: 200 }, (_, index) => `pkg-${index}`);
  const overflowing = workspace("overflow", ids);
  overflowing.packages.totalCount = 201;
  const unavailable = workspace("unavailable");
  unavailable.packages = null;
  f.state.pipelines.enc = [overflowing, workspace("empty"), unavailable];
  f.state.continuation.set("enc/overflow/2", page([member("last")], 2, 200, 201));
  f.state.continuation.set("enc/unavailable/1", page([member("last")], 1, 200));

  f.calls.length = 0;
  const result = await f.store.loadJobs({ cancelOnLeave: true });
  assert.equal(result.ok, true);
  assert.equal(result.data.jobs.length, 202);
  assert.deepEqual(
    f.calls
      .filter(({ kind }) => kind === "membership")
      .map(({ workspaceId, number, size }) => [workspaceId, number, size]),
    [
      ["overflow", 2, 200],
      ["unavailable", 1, 200],
    ]
  );
  assert.equal(summarize(f.calls).metadataDetail, 201);
  t.diagnostic(JSON.stringify(summarize(f.calls)));
});

for (const [label, intercept, error] of [
  ["HTTP failure", () => new Response(null, { status: 403 }), /Access denied/],
  [
    "malformed membership",
    () => Response.json(page([{ ...workspace("west"), packages: {} }], 1, 20)),
    /invalid page envelope/,
  ],
  [
    "duplicate Workspace",
    () => Response.json(page([workspace("west"), workspace("west")], 1, 20)),
    /duplicate Workspace/,
  ],
  [
    "short membership",
    () =>
      Response.json(
        page([{ ...workspace("west"), packages: page([member("shared")], 1, 200, 201) }], 1, 20)
      ),
    /incomplete or inconsistent page/,
  ],
]) {
  test(`${label} preserves Jobs and rejects the fresh catalogue`, async () => {
    const f = fixture({ enc: [workspace("west", ["shared"])] });
    await f.store.loadJobs();
    f.state.intercept = (call) => (call.kind === "overview" ? intercept() : null);
    const result = await f.store.loadJobs({ cancelOnLeave: true });
    assert.equal(result.ok, false);
    assert.match(result.error.message, error);
    assert.equal(f.published.length, 0);
    assert.deepEqual(
      f.store.getSnapshot().jobs.map(({ packageId }) => packageId),
      ["shared"]
    );
    assert.equal(summarize(f.calls).membership, 0);
    f.state.intercept = null;
    assert.equal((await f.store.loadJobs()).ok, true);
    assert.equal(f.published.length, 1);
  });
}

for (const action of ["supersede", "navigate", "dispose"]) {
  test(`${action} cancels a late overview response`, async () => {
    const f = fixture({ enc: [workspace("west", ["shared"])] });
    await f.store.loadJobs();
    let release;
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    f.state.intercept = (call) => {
      if (call.kind !== "overview") return null;
      started(call.signal);
      return new Promise((resolve) => {
        release = resolve;
      });
    };

    const old = f.store.loadJobs({ cancelOnLeave: true });
    const oldSignal = await ready;
    f.state.intercept = null;
    f.state.pipelines = { enc: [workspace("east", ["current"])] };
    if (action === "supersede") assert.equal((await f.store.loadJobs()).ok, true);
    if (action === "navigate") f.store.cancelNavigationLoad();
    if (action === "dispose") f.store.destroy();

    assert.equal(oldSignal.aborted, true);
    release(Response.json(page([workspace("old", ["old"])], 1, 20)));
    assert.equal((await old).stale, true);
    assert.deepEqual(
      f.published.map(({ jobs }) => jobs[0].packageId),
      action === "supersede" ? ["current"] : []
    );
    assert.equal(summarize(f.calls).metadataDetail, action === "supersede" ? 2 : 1);
    if (action === "navigate") {
      assert.equal(f.store.getSnapshot().isLoading, false);
      assert.equal(f.store.getSnapshot().jobs[0].packageId, "shared");
    }
  });
}

test("A duplicate overflow member rejects the fresh catalogue", async () => {
  const f = fixture({ enc: [workspace("start")] });
  await f.store.loadJobs();
  const ids = Array.from({ length: 200 }, (_, index) => `pkg-${index}`);
  const overflowing = workspace("overflow", ids);
  overflowing.packages.totalCount = 201;
  f.state.pipelines.enc = [overflowing];
  f.state.continuation.set("enc/overflow/2", page([member(ids[0])], 2, 200, 201));

  const result = await f.store.loadJobs({ cancelOnLeave: true });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Duplicate identity/);
  assert.equal(f.published.length, 0);
  assert.equal(summarize(f.calls).metadataDetail, 0);
});

test("Leaving during a retry keeps the earlier failure and the last verified Jobs", async () => {
  const f = fixture({ enc: [workspace("west", ["shared"])] });
  await f.store.loadJobs();
  f.state.intercept = (call) =>
    call.kind === "overview" ? new Response(null, { status: 403 }) : null;
  const failure = await f.store.loadJobs();
  assert.equal(failure.ok, false);

  let finish;
  f.state.intercept = (call) =>
    call.kind === "overview"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : null;
  const pending = f.store.loadJobs({ cancelOnLeave: true });
  await new Promise(setImmediate);
  f.store.cancelNavigationLoad();
  finish(Response.json(page([workspace("east")], 1, 20)));

  assert.equal((await pending).stale, true);
  assert.equal(f.store.getSnapshot().error, failure.error);
  assert.equal(f.store.getSnapshot().jobs[0].packageId, "shared");
  assert.equal(f.published.length, 0);
});

test("Binding and unbinding reconcile real wire clients through one bounded Overview load", async (t) => {
  const f = fixture({ enc: [workspace("east"), workspace("west")], paper: [workspace("west")] });
  const session = f.newAssignmentSession();
  const scope = { pipelineIds: ["enc"], workspaceKeys: null };
  assert.equal(await session.select("shared"), true);
  assert.equal((await f.store.loadJobs()).data.jobs.length, 0);

  session.setAssigned("enc", true);
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  session.setAssigned("paper", true);
  assert.equal(await session.save(), true);
  f.calls.length = 0;

  const onReturn = f.store.loadJobs();
  assert.equal(f.store.loadJobs(), onReturn, "Manual Refresh shares the dirty generation");
  const { data } = await onReturn;
  assert.equal(f.published.length, 1);
  assert.deepEqual(f.published[0].jobs, data.jobs);
  assert.equal(new Set(data.jobs.map(({ id }) => id)).size, 3);
  assert.equal(countOpenJobsByWorkspace(data.jobs).size, 3);
  const visiblePackageIds = getVisiblePackageIdsForScope(data.jobs, scope);
  assert.deepEqual(visiblePackageIds, ["shared"]);
  const geometry = await loadPackageAois(f.catalogue, scope);
  assert.equal(geometry[0].shortId, "shared");

  assert.equal(f.store.hasPendingMembershipRefresh(), false);
  const addedCounts = summarize(f.calls);
  assert.deepEqual(addedCounts, {
    pipeline: 1,
    overview: 2,
    membership: 0,
    workspaceDetail: 0,
    metadataList: 0,
    metadataDetail: 1,
    geometry: 1,
  });
  t.diagnostic(`Changed return with first bindings: ${JSON.stringify(addedCounts)}`);

  session.setAssigned("enc", false);
  session.setAssigned("paper", false);
  assert.equal(await session.save(), true);
  f.calls.length = 0;
  assert.equal((await f.store.loadJobs()).ok, true);
  assert.deepEqual(f.published.at(-1).jobs, []);
  assert.deepEqual(getVisiblePackageIdsForScope(f.store.getSnapshot().jobs, scope), []);
  const afterUnbind = await loadPackageAois(f.catalogue, scope);
  const idsAfterUnbind = getVisiblePackageIdsForScope(f.store.getSnapshot().jobs, scope);
  assert.deepEqual(
    afterUnbind.filter(({ packageId }) => idsAfterUnbind.includes(packageId)),
    []
  );
  const removedCounts = summarize(f.calls);
  assert.deepEqual(removedCounts, {
    pipeline: 1,
    overview: 2,
    membership: 0,
    workspaceDetail: 0,
    metadataList: 0,
    metadataDetail: 0,
    geometry: 1,
  });
  t.diagnostic(`Changed return after last unbind: ${JSON.stringify(removedCounts)}`);
  session.destroy();
  f.store.destroy();
});

test("An in-flight startup Overview cannot satisfy a post-mutation read", async (t) => {
  const f = fixture({ enc: [workspace("east")] });
  let finish;
  let started;
  const pendingStartup = new Promise((resolve) => {
    finish = resolve;
  });
  const startedStartup = new Promise((resolve) => {
    started = resolve;
  });
  f.state.intercept = (call) => {
    if (call.kind !== "overview") return;
    f.state.intercept = null;
    const preMutation = Response.json(page([workspace("east")], 1, 20));
    started();
    return pendingStartup.then(() => preMutation);
  };
  const startup = f.store.loadJobs();
  await startedStartup;

  const session = f.newAssignmentSession();
  await session.select("shared");
  session.setAssigned("enc", true);
  assert.equal(await session.save(), true);
  const postMutation = f.store.loadJobs();
  finish();

  assert.equal((await startup).stale, true);
  assert.equal((await postMutation).data.jobs[0].packageId, "shared");
  assert.equal(f.published.length, 1);
  const counts = summarize(f.calls);
  assert.equal(counts.overview, 2, "One preexisting startup page and one fresh page");
  assert.equal(counts.membership, 0);
  t.diagnostic(`Startup overlap, including preexisting startup calls: ${JSON.stringify(counts)}`);
  session.destroy();
  f.store.destroy();
});

test("COMMENT-02 transport counts preserve 29-Workspace startup, comment-only return and binding refresh", async (t) => {
  const ids = Array.from({ length: 34 }, (_, index) => `package-${index}`);
  const pipelines = Object.fromEntries(
    [10, 10, 9].map((size, index) => [
      `pipeline-${index}`,
      Array.from({ length: size }, (_, row) => workspace(`workspace-${row}`, row ? [] : ids)),
    ])
  );
  const f = fixture(pipelines, ids);
  const availability = createPackageCommentAvailability({
    read: f.catalogue.bindingCommentAvailability,
    onChange() {},
  });
  let visible = true;
  const update = (snapshot = f.store.getSnapshot()) => {
    const context = { visible, busy: snapshot.isLoading };
    if (!visible || snapshot.isLoading) availability.setContext(context);
    if (!snapshot.isLoading && snapshot.lastChange.type === JOB_STORE_CHANGE_TYPE.JOBS_LOADED) {
      availability.acceptJobs(snapshot.lastChange.sequence, snapshot.jobs);
    }
    if (visible && !snapshot.isLoading) availability.setContext(context);
  };
  const unsubscribe = f.store.subscribe(update);
  const kinds = () => f.calls.map(({ kind }) => kind);
  try {
    const initial = await f.store.loadJobs();
    await nextTurn();
    assert.equal(initial.data.jobs.length, 102);
    assert.equal(summarize(f.calls).overview, 3);
    assert.equal(summarize(f.calls).membership, 0);
    assert.deepEqual(
      f.calls.filter(({ kind }) => kind === "availability"),
      [
        {
          kind: "availability",
          bindings: ids
            .toSorted()
            .flatMap((packageId) =>
              Object.keys(pipelines).map((pipelineId) => ({ packageId, pipelineId }))
            ),
        },
      ]
    );
    assert.equal(kinds().includes("comment"), false);
    t.diagnostic(`Startup: 102 distinct bindings, ${JSON.stringify(kinds())}`);

    visible = false;
    update();
    const session = f.newAssignmentSession(availability.invalidate);
    await session.select(ids[0]);
    assert.equal(session.addComment("pipeline-0"), true);
    session.editComment(session.snapshot().draft.comments[0].id, "Saved on Main Map");
    assert.equal(await session.save(), true);
    assert.equal(session.snapshot().saveConfirmed, true);
    assert.equal(f.store.hasPendingMembershipRefresh(), false);
    f.calls.length = 0;
    visible = true;
    update();
    await nextTurn();
    assert.deepEqual(f.calls, [
      {
        kind: "availability",
        bindings: [{ packageId: ids[0], pipelineId: "pipeline-0" }],
      },
    ]);
    assert.equal(
      availability.getStatus({ packageId: ids[0], pipelineId: "pipeline-0" }),
      "present"
    );
    assert.equal(availability.getStatus({ packageId: ids[0], pipelineId: "pipeline-1" }), "absent");
    assert.equal(session.snapshot().saveConfirmed, true);
    t.diagnostic(`Comment-only return: ${JSON.stringify(kinds())}`);

    visible = false;
    update();
    await session.select("new-package");
    session.setAssigned("pipeline-0", true);
    assert.equal(session.addComment("pipeline-0"), true);
    session.editComment(session.snapshot().draft.comments[0].id, "First binding and comment");
    assert.equal(await session.save(), true);
    assert.equal(f.store.hasPendingMembershipRefresh(), true);
    f.calls.length = 0;
    const refresh = f.store.loadJobs({ cancelOnLeave: true });
    visible = true;
    update();
    assert.equal(f.store.loadJobs({ cancelOnLeave: true }), refresh);
    assert.equal((await refresh).ok, true);
    await nextTurn();
    assert.equal(summarize(f.calls).overview, 3);
    assert.equal(summarize(f.calls).membership, 0);
    assert.equal(f.calls.filter(({ kind }) => kind === "availability").length, 1);
    assert.equal(f.calls.find(({ kind }) => kind === "availability").bindings.length, 103);
    assert.equal(
      availability.getStatus({ packageId: "new-package", pipelineId: "pipeline-0" }),
      "present"
    );
    assert.equal(kinds().includes("comment"), false);
    t.diagnostic(
      `Mixed first bind and comment return: ${JSON.stringify(summarize(f.calls))}, 1 availability`
    );

    visible = false;
    update();
    session.setAssigned("pipeline-0", false);
    assert.equal(await session.save(), true);
    f.calls.length = 0;
    const removal = f.store.loadJobs({ cancelOnLeave: true });
    visible = true;
    update();
    assert.equal((await removal).ok, true);
    await nextTurn();
    assert.equal(summarize(f.calls).overview, 3);
    assert.equal(summarize(f.calls).membership, 0);
    const removalBatch = f.calls.filter(({ kind }) => kind === "availability");
    assert.equal(removalBatch.length, 1);
    assert.equal(
      removalBatch[0].bindings.some(({ packageId }) => packageId === "new-package"),
      false
    );
    assert.equal(
      availability.getStatus({ packageId: "new-package", pipelineId: "pipeline-0" }),
      "unknown"
    );
    t.diagnostic(`Last unbind return: ${JSON.stringify(summarize(f.calls))}, 1 availability`);

    visible = false;
    update();
    session.setAssigned("pipeline-0", true);
    assert.equal(await session.save(), true);
    f.calls.length = 0;
    const restore = f.store.loadJobs({ cancelOnLeave: true });
    visible = true;
    update();
    assert.equal((await restore).ok, true);
    await nextTurn();
    assert.equal(summarize(f.calls).overview, 3);
    assert.equal(summarize(f.calls).membership, 0);
    assert.equal(f.calls.filter(({ kind }) => kind === "availability").length, 1);
    assert.equal(
      availability.getStatus({ packageId: "new-package", pipelineId: "pipeline-0" }),
      "present"
    );
    assert.equal(kinds().includes("comment"), false);
    t.diagnostic(`Rebind return: ${JSON.stringify(summarize(f.calls))}, 1 availability`);
  } finally {
    unsubscribe();
    availability.destroy();
  }
});
