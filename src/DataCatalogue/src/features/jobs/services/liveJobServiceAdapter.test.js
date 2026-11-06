import test from "node:test";
import assert from "node:assert/strict";
import { createLiveJobServiceAdapter } from "./liveJobServiceAdapter.js";
import { createScopedJobStatusAdapter, scopedJobId } from "../mock/scopedJobStatusAdapter.js";
import { createJobService } from "./jobService.js";
import { createJobStore } from "../state/jobStore.js";
import { createJobLayerFeatureData } from "../../map/layers/jobLayerFeatureData.js";

const scope = (pipelineId = "p", workspaceId = "w") => ({
  pipelineId,
  workspaceId,
  pipelineName: pipelineId,
  name: workspaceId,
});
const memberPage = (items) => ({ items, page: 0, pageSize: 200, total: items.length });
function fixture() {
  return {
    async workspacePackages() {
      return memberPage([{ packageId: "pkg", shortId: "NM1000" }]);
    },
    async package(id) {
      return {
        id,
        packageId: id,
        name: "NM1000",
        title: "Notice",
        severity: "0",
        geometryRef: { featureClass: "AOI", globalId: "global" },
      };
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("mock statuses are isolated by all three identities and reset without backend writes", () => {
  const statuses = createScopedJobStatusAdapter();
  const context = { packageId: "pkg", pipelineId: "p", workspaceId: "w" };
  statuses.set(context, "done");
  assert.equal(statuses.get(context), "done");
  assert.equal(statuses.get({ ...context, pipelineId: "other" }), "todo");
  assert.equal(statuses.get({ ...context, workspaceId: "other" }), "todo");
  assert.equal(statuses.get({ ...context, packageId: "other" }), "todo");
  assert.notEqual(
    scopedJobId({ ...context, packageId: 'a","b' }),
    scopedJobId({ ...context, pipelineId: 'a","b' })
  );
  assert.throws(() => statuses.set(context, "owned"));
  statuses.reset();
  assert.equal(statuses.get(context), "todo");
});

test("Workspace-backed Jobs retain context, expose exact Severity and never fabricate AOIs or follow-ups", async () => {
  const adapter = createLiveJobServiceAdapter({ catalogue: fixture() });
  await assert.rejects(adapter.loadJobs(), /Workspace catalogue has not loaded/);
  adapter.setScope(scope());
  const { jobs } = await adapter.loadJobs();
  assert.equal(jobs[0].packageId, "pkg");
  assert.equal(jobs[0].shortId, "NM1000");
  assert.equal(jobs[0].packageTitle, "Notice");
  assert.equal(jobs[0].pipelineId, "p");
  assert.equal(jobs[0].workspaceId, "w");
  assert.equal(jobs[0].severity, "0");
  assert.equal(jobs[0].priority, null);
  assert.equal(jobs[0].geometry, null);
  assert.deepEqual(createJobLayerFeatureData(jobs), { pointFeatures: [], polygonFeatures: [] });
  assert.deepEqual((await adapter.updateJobStatus(jobs[0].id, "done")).createdJobs, []);
  adapter.setScope(scope("p", "other"));
  assert.equal((await adapter.loadJobs()).jobs[0].status, "todo");
  adapter.setScope(scope());
  assert.equal((await adapter.loadJobs()).jobs[0].status, "done");
  adapter.resetStatuses();
  assert.equal((await adapter.loadJobs()).jobs[0].status, "todo");
});

test("all member pages are hydrated once and sorted by exact Severity", async () => {
  const catalogue = fixture();
  const requests = [];
  catalogue.workspacePackages = async (_pipeline, _workspace, { page }) => ({
    items: [{ packageId: page === 0 ? "high-number" : "low-number" }],
    page,
    pageSize: 1,
    total: 2,
  });
  catalogue.package = async (id) => {
    requests.push(id);
    return { id, severity: id === "high-number" ? "9007199254740993" : "9007199254740992" };
  };
  const adapter = createLiveJobServiceAdapter({ catalogue });
  adapter.setScope(scope());
  assert.deepEqual(
    (await adapter.loadJobs()).jobs.map((job) => job.packageId),
    ["low-number", "high-number"]
  );
  assert.deepEqual(requests, ["high-number", "low-number"]);
});

test("hydration failures return errors rather than an apparently complete partial Workspace", async () => {
  const catalogue = fixture();
  catalogue.package = async () => {
    throw new Error("Denied");
  };
  const adapter = createLiveJobServiceAdapter({ catalogue });
  adapter.setScope(scope());
  const result = await createJobService({ adapter }).loadJobs();
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.match(result.error.message, /Denied/);
});

test("superseded Workspace load cannot overwrite newer Jobs even if transport ignores cancellation", async () => {
  const slow = deferred();
  const catalogue = fixture();
  catalogue.workspacePackages = async (_pipeline, workspaceId) =>
    workspaceId === "slow" ? slow.promise : memberPage([{ packageId: workspaceId }]);
  const adapter = createLiveJobServiceAdapter({ catalogue });
  const store = createJobStore({ service: createJobService({ adapter }) });
  adapter.setScope(scope("p", "slow"));
  const old = store.loadJobs({ clear: true });
  adapter.setScope(scope("p", "new"));
  await store.loadJobs({ clear: true });
  slow.resolve(memberPage([{ packageId: "old" }]));
  assert.equal((await old).stale, true);
  assert.equal(store.getSnapshot().jobs[0].packageId, "new");
  assert.equal(store.getSnapshot().error, null);
});

test("store teardown prevents a pending read from publishing", async () => {
  const slow = deferred();
  const store = createJobStore({ service: { loadJobs: () => slow.promise } });
  let count = 0;
  store.subscribe(() => count++);
  const pending = store.loadJobs();
  const before = count;
  store.destroy();
  slow.resolve({ ok: true, data: { jobs: [] } });
  assert.equal((await pending).stale, true);
  assert.equal(count, before);
});

test("an in-flight refresh cannot restore status from before a successful mutation", async () => {
  const slow = deferred();
  let calls = 0;
  const job = { id: "scoped", status: "todo" };
  const store = createJobStore({
    service: {
      async loadJobs() {
        return ++calls === 1 ? { ok: true, data: { jobs: [job] } } : slow.promise;
      },
      async updateJobStatus() {
        return { ok: true, data: { job: { ...job, status: "done" } } };
      },
    },
  });
  await store.loadJobs();
  const loading = store.loadJobs();
  await store.updateJobStatus("scoped", "done");
  slow.resolve({ ok: true, data: { jobs: [job] } });
  assert.equal((await loading).stale, true);
  assert.equal(store.getSnapshot().jobs[0].status, "done");
  assert.equal(store.getSnapshot().isLoading, false);
});

test("concurrent mutations on different Jobs both publish without invalidating each other", async () => {
  const jobs = [
    { id: "first", status: "todo" },
    { id: "second", status: "todo" },
  ];
  const store = createJobStore({
    service: {
      async loadJobs() {
        return { ok: true, data: { jobs } };
      },
      async updateJobStatus(id, status) {
        return { ok: true, data: { job: { id, status } } };
      },
    },
  });
  await store.loadJobs();
  await Promise.all([
    store.updateJobStatus("first", "done"),
    store.updateJobStatus("second", "done"),
  ]);
  assert.deepEqual(
    store.getSnapshot().jobs.map((job) => job.status),
    ["done", "done"]
  );
});

test("All available Pipelines load every Workspace, reuse Package details and keep contextual Job status", async () => {
  const catalogue = fixture();
  const packageReads = [];
  catalogue.workspacePackages = async (pipelineId, workspaceId) =>
    memberPage([{ packageId: "shared", shortId: `${pipelineId}-${workspaceId}` }]);
  catalogue.package = async (id) => {
    packageReads.push(id);
    return { id, severity: "2", title: "Shared" };
  };
  const adapter = createLiveJobServiceAdapter({ catalogue });
  adapter.setWorkspaces([scope("enc", "east"), scope("paper", "east"), scope("enc", "west")]);
  const first = await adapter.loadJobs();
  assert.equal(first.jobs.length, 3);
  assert.deepEqual(packageReads, ["shared"]);
  const encEast = first.jobs.find((job) => job.pipelineId === "enc" && job.workspaceId === "east");
  await adapter.updateJobStatus(encEast.id, "done");
  adapter.setWorkspaces([scope("enc", "east"), scope("paper", "east")]);
  const second = await adapter.loadJobs();
  assert.equal(second.jobs.length, 2);
  assert.equal(second.jobs.find((job) => job.pipelineId === "enc").status, "done");
  assert.equal(second.jobs.find((job) => job.pipelineId === "paper").status, "todo");
});

test("A broken Workspace read never returns a seemingly complete all-Pipeline Jobs list", async () => {
  const catalogue = fixture();
  catalogue.workspacePackages = async (_pipeline, workspaceId) => {
    if (workspaceId === "broken") throw new Error("Workspace API unavailable");
    return memberPage([{ packageId: "shared" }]);
  };
  const adapter = createLiveJobServiceAdapter({ catalogue });
  adapter.setWorkspaces([scope("enc", "ok"), scope("enc", "broken")]);
  const result = await createJobService({ adapter }).loadJobs();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Workspace API unavailable/);
});
