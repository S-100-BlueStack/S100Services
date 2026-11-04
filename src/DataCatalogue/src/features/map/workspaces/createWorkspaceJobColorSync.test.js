import test from "node:test";
import assert from "node:assert/strict";
import { JOB_STORE_CHANGE_TYPE } from "../../jobs/state/jobStore.js";
import { workspaceSelectionKey } from "./pipelineVisibility.js";
import { createWorkspaceJobColorSync } from "./createWorkspaceJobColorSync.js";

const workspace = (pipelineId, workspaceId) => ({ pipelineId, workspaceId });
const job = (id, pipelineId, workspaceId, status = "todo") => ({
  id,
  pipelineId,
  workspaceId,
  status,
});
const snapshot = (jobs, type, extras = {}) => ({
  jobs,
  isLoading: false,
  error: null,
  lastChange: { type },
  ...extras,
});

function fixture() {
  const published = [];
  const sync = createWorkspaceJobColorSync({ publishCounts: (counts) => published.push(counts) });
  return { published, sync };
}

test("First load stays unknown until Jobs are authoritative, including an empty catalogue", () => {
  const { published, sync } = fixture();
  sync.onJobsChanged(snapshot([], JOB_STORE_CHANGE_TYPE.INITIAL));
  assert.equal(published.length, 0);

  sync.setCatalogue([]);
  assert.deepEqual(published, [null]);
  sync.onJobsChanged(snapshot([], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  assert.ok(published[1] instanceof Map);
  assert.equal(published[1].size, 0);
});

test("Opening Jobs preserves colors during loading and failed refresh", () => {
  const { published, sync } = fixture();
  const scope = workspace("enc", "east");
  const previous = [job("j1", "enc", "east")];
  sync.setCatalogue([scope]);
  sync.onJobsChanged(snapshot(previous, JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  const lastKnown = published[1];
  assert.equal(lastKnown.get(workspaceSelectionKey(scope)), 1);

  // Even when the store clears its list, that intermediate state is not authoritative.
  sync.onJobsChanged(snapshot([], JOB_STORE_CHANGE_TYPE.JOBS_LOADED, { isLoading: true }));
  sync.onJobsChanged(
    snapshot([], JOB_STORE_CHANGE_TYPE.JOBS_LOAD_FAILED, { error: new Error("offline") })
  );
  assert.equal(published.length, 2);
  assert.equal(published[1], lastKnown);

  sync.onJobsChanged(snapshot([], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  assert.equal(published.length, 3);
  assert.equal(published[2].size, 0);
});

test("Status updates recolor affected Workspaces without a new catalogue fetch", () => {
  const { published, sync } = fixture();
  const scope = workspace("paper", "west");
  sync.setCatalogue([scope]);
  sync.onJobsChanged(snapshot([job("j1", "paper", "west")], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  sync.onJobsChanged(
    snapshot([job("j1", "paper", "west", "done")], JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED)
  );
  assert.equal(published.length, 3);
  assert.equal(published[2].size, 0);
});

test("Unchanged catalogue preserves last known colors but a changed scope invalidates them", () => {
  const { published, sync } = fixture();
  sync.setCatalogue([workspace("enc", "east"), workspace("paper", "west")]);
  sync.onJobsChanged(snapshot([job("j1", "enc", "east")], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  sync.setCatalogue([workspace("paper", "west"), workspace("enc", "east")]);
  assert.equal(published.length, 2);

  sync.setCatalogue([workspace("paper", "west")]);
  assert.equal(published.length, 3);
  assert.equal(published[2], null);
  sync.onJobsChanged(snapshot([], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  assert.ok(published[3] instanceof Map);
});

test("A status update failure does not overwrite the last successful counts", () => {
  const { published, sync } = fixture();
  sync.setCatalogue([workspace("enc", "east")]);
  sync.onJobsChanged(snapshot([job("j1", "enc", "east")], JOB_STORE_CHANGE_TYPE.JOBS_LOADED));
  sync.onJobsChanged(
    snapshot([], JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATE_FAILED, { error: new Error("failure") })
  );
  assert.equal(published.length, 2);
});
