import test from "node:test";
import assert from "node:assert/strict";
import {
  countOpenJobsByWorkspace,
  workspaceColorForOpenJobs,
  WORKSPACE_JOB_COLOR_LEVELS,
} from "./workspaceJobColors.js";
import { workspaceSelectionKey } from "./pipelineVisibility.js";

const job = (id, pipelineId, workspaceId, status = "todo") => ({
  id,
  pipelineId,
  workspaceId,
  status,
});

test("Configured color thresholds distinguish zero, one, three and five open Jobs", () => {
  assert.equal(WORKSPACE_JOB_COLOR_LEVELS.length, 4);
  assert.deepEqual(workspaceColorForOpenJobs(0), WORKSPACE_JOB_COLOR_LEVELS[0].rgb);
  assert.deepEqual(workspaceColorForOpenJobs(1), WORKSPACE_JOB_COLOR_LEVELS[1].rgb);
  assert.deepEqual(workspaceColorForOpenJobs(2), WORKSPACE_JOB_COLOR_LEVELS[1].rgb);
  assert.deepEqual(workspaceColorForOpenJobs(3), WORKSPACE_JOB_COLOR_LEVELS[2].rgb);
  assert.deepEqual(workspaceColorForOpenJobs(4), WORKSPACE_JOB_COLOR_LEVELS[2].rgb);
  assert.deepEqual(workspaceColorForOpenJobs(5), WORKSPACE_JOB_COLOR_LEVELS[3].rgb);
  assert.notDeepEqual(workspaceColorForOpenJobs(null), workspaceColorForOpenJobs(0));
});

test("Only active Jobs count, with independent Pipeline/Workspace scopes and no duplicates", () => {
  const items = [
    job("j1", "enc", "east"),
    job("j1", "enc", "east"),
    job("j2", "enc", "east", "done"),
    job("j3", "enc", "west", "inProgress"),
    job("j4", "paper", "east", "todo"),
  ];
  const counts = countOpenJobsByWorkspace(items);
  assert.equal(counts.get(workspaceSelectionKey({ pipelineId: "enc", workspaceId: "east" })), 1);
  assert.equal(counts.get(workspaceSelectionKey({ pipelineId: "enc", workspaceId: "west" })), 1);
  assert.equal(counts.get(workspaceSelectionKey({ pipelineId: "paper", workspaceId: "east" })), 1);
});
