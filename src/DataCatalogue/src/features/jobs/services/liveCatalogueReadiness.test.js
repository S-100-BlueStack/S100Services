import assert from "node:assert/strict";
import test from "node:test";
import { createPipelineVisibility } from "../../map/workspaces/createPipelineVisibility.js";
import { createLiveJobServiceAdapter } from "./liveJobServiceAdapter.js";
import { createJobService } from "./jobService.js";
import { createJobStore } from "../state/jobStore.js";

class TestElement extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.children = [];
    this.style = {};
  }
  setAttribute() {}
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function withCatalogueFixture(
  { failEndpoint = null, delayedPipelines = null, empty = false },
  run
) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new TestElement(tag),
    createTextNode: (value) => ({ textContent: value }),
  };
  let unavailable = Boolean(failEndpoint);
  let workspaceId = "east";
  let delayedMembership = null;
  let pipelineReads = 0;
  let workspaceReads = 0;
  let membershipReads = 0;
  let packageReads = 0;
  const catalogue = {
    async pipelines() {
      pipelineReads++;
      if (failEndpoint === "pipelines" && unavailable) {
        throw new Error("Pipelines denied (403)");
      }
      if (delayedPipelines) await delayedPipelines.promise;
      return empty ? [] : [{ id: "enc", name: "ENC" }];
    },
    async workspaces({ page }) {
      workspaceReads++;
      if (failEndpoint === "workspaces" && unavailable) {
        throw new Error("Workspaces offline");
      }
      assert.equal(page, 0);
      const items = empty ? [] : [{ pipelineId: "enc", workspaceId, name: "Eastern Denmark" }];
      return { page, pageSize: 200, total: items.length, items };
    },
    async workspacePackages(_pipeline, selectedWorkspace, { page }) {
      membershipReads++;
      assert.equal(page, 0);
      if (selectedWorkspace === "east" && delayedMembership) {
        await delayedMembership.promise;
      }
      return {
        page,
        pageSize: 200,
        total: 1,
        items: [{ packageId: `pkg-${selectedWorkspace}`, shortId: "NM1000" }],
      };
    },
    async package(id) {
      packageReads++;
      return { id, shortId: "NM1000", severity: "0" };
    },
  };
  let visibility;
  const adapter = createLiveJobServiceAdapter({
    catalogue,
    ensureWorkspaces: () => visibility.ensureLoaded(),
  });
  const store = createJobStore({ service: createJobService({ adapter }) });
  const container = new TestElement("div");
  let hasLoadedJobCatalogue = false;
  visibility = createPipelineVisibility({
    catalogue,
    container,
    onChange() {},
    onWorkspacesLoaded(workspaces) {
      const wasLoaded = hasLoadedJobCatalogue;
      adapter.setWorkspaces(workspaces);
      hasLoadedJobCatalogue = true;
      // Match application wiring: only the initial load can join a waiting Jobs read.
      if (wasLoaded || !store.getSnapshot().isLoading) {
        void store.loadJobs({ clear: true });
      }
    },
  });
  try {
    await run({
      adapter,
      store,
      visibility,
      container,
      allowCatalogue() {
        unavailable = false;
      },
      setWorkspaceId(value) {
        workspaceId = value;
      },
      delayOldMembership(pending) {
        delayedMembership = pending;
      },
      getReads() {
        return { pipelineReads, workspaceReads, membershipReads, packageReads };
      },
    });
  } finally {
    visibility.destroy();
    store.destroy();
    globalThis.document = previousDocument;
  }
}

for (const failEndpoint of ["pipelines", "workspaces"]) {
  test(`Failed initial ${failEndpoint} catalogue cannot publish successful empty Jobs and retry recovers`, async () => {
    await withCatalogueFixture({ failEndpoint }, async (fixture) => {
      // The initial automatic catalogue request is allowed to settle before Jobs opens.
      await new Promise((resolve) => setImmediate(resolve));
      assert.match(fixture.container.children[0].textContent, /could not be loaded/);
      assert.deepEqual(fixture.getReads().membershipReads, 0);

      const failedRefresh = await fixture.store.loadJobs();
      assert.equal(failedRefresh.ok, false);
      assert.equal(fixture.store.getSnapshot().jobs.length, 0);
      assert.ok(fixture.store.getSnapshot().error);
      assert.equal(fixture.getReads().membershipReads, 0);
      assert.equal(fixture.getReads().pipelineReads, 2, "Retry must re-read the prerequisite");

      fixture.allowCatalogue();
      const successfulRetry = await fixture.store.loadJobs();
      assert.equal(successfulRetry.ok, true);
      assert.equal(successfulRetry.data.jobs.length, 1);
      assert.equal(fixture.store.getSnapshot().error, null);
      assert.equal(fixture.getReads().membershipReads, 1);
      assert.equal(fixture.getReads().packageReads, 1);
      assert.equal(fixture.getReads().pipelineReads, 3);
    });
  });
}

test("Jobs opening during initial catalogue load waits and reuses its requests", async () => {
  const slow = deferred();
  await withCatalogueFixture({ delayedPipelines: slow }, async (fixture) => {
    const first = fixture.store.loadJobs();
    const second = fixture.visibility.ensureLoaded();
    assert.equal(fixture.store.getSnapshot().isLoading, true);
    assert.equal(fixture.getReads().pipelineReads, 1);
    assert.equal(fixture.getReads().membershipReads, 0);

    slow.resolve();
    assert.equal((await second).ok, true);
    assert.equal((await first).ok, true);
    assert.equal(fixture.store.getSnapshot().jobs.length, 1);
    assert.equal(fixture.getReads().pipelineReads, 1);
    assert.equal(fixture.getReads().workspaceReads, 1);
    assert.equal(
      fixture.getReads().membershipReads,
      1,
      "No duplicated Job load after catalogue completion"
    );
  });
});

test("A verified zero-Workspace catalogue is a valid empty Jobs result", async () => {
  await withCatalogueFixture({ empty: true }, async (fixture) => {
    assert.equal((await fixture.visibility.ensureLoaded()).ok, true);
    const result = await fixture.store.loadJobs();
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.jobs, []);
    assert.equal(fixture.store.getSnapshot().error, null);
    assert.equal(fixture.getReads().membershipReads, 0);
    assert.equal(fixture.getReads().packageReads, 0);
  });
});

test("Catalogue reload supersedes in-flight Jobs using the previous Workspace scope", async () => {
  await withCatalogueFixture({}, async (fixture) => {
    assert.equal((await fixture.visibility.ensureLoaded()).ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.store.getSnapshot().jobs[0].workspaceId, "east");

    const oldRequest = deferred();
    fixture.delayOldMembership(oldRequest);
    const oldLoad = fixture.store.loadJobs();
    fixture.setWorkspaceId("west");
    assert.equal((await fixture.visibility.reload()).ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.store.getSnapshot().jobs[0].workspaceId, "west");

    oldRequest.resolve();
    assert.equal((await oldLoad).stale, true);
    assert.equal(fixture.store.getSnapshot().jobs[0].workspaceId, "west");
  });
});
