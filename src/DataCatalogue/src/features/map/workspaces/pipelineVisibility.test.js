import test from "node:test";
import assert from "node:assert/strict";
import {
  groupWorkspacePipelines,
  preservePipelineSelection,
  preserveWorkspaceSelection,
  workspaceSelectionKey,
  visibleWorkspacePipelines,
} from "./pipelineVisibility.js";

const workspace = (pipelineId, pipelineName, workspaceId, name) => ({
  pipelineId,
  pipelineName,
  workspaceId,
  name,
});

test("All Workspaces are visible initially and Pipelines are alphabetic regardless of API order", () => {
  const groups = groupWorkspacePipelines([
    workspace("paper", "Paper Charts", "e", "Eastern Denmark"),
    workspace("enc", "ENC", "w", "Western Denmark"),
    workspace("enc", "ENC", "e", "Eastern Denmark"),
    workspace("paper", "Paper Charts", "w", "Western Denmark"),
  ]);
  assert.deepEqual(
    groups.map((group) => group.name),
    ["ENC", "Paper Charts"]
  );
  assert.deepEqual(
    groups.map((group) => group.workspaces.map((ws) => ws.name)),
    [
      ["Eastern Denmark", "Western Denmark"],
      ["Eastern Denmark", "Western Denmark"],
    ]
  );
  assert.equal(
    visibleWorkspacePipelines(
      groups,
      groups.map((g) => g.id)
    ).length,
    4
  );
  assert.deepEqual(
    visibleWorkspacePipelines(groups, new Set(["enc"])).map((w) => w.pipelineId),
    ["enc", "enc"]
  );
});

test("Reload preserves explicit exclusions and defaults previously unseen Pipelines on", () => {
  const old = groupWorkspacePipelines([workspace("a", "A", "one", "One")]);
  const next = groupWorkspacePipelines([
    workspace("a", "A", "one", "One"),
    workspace("b", "B", "two", "Two"),
  ]);
  assert.deepEqual(preservePipelineSelection(next, old, new Set()), ["b"]);
  assert.deepEqual(preservePipelineSelection(next, [], new Set()), ["a", "b"]);
});

test("Invalid Workspace identity never becomes a misleading Pipeline", () => {
  assert.throws(() => groupWorkspacePipelines([{ pipelineId: "enc" }]), /invalid identity/);
});

test("Pipelines without any Workspace are still available as visibility toggles", () => {
  const groups = groupWorkspacePipelines(
    [workspace("enc", "ENC", "e", "East")],
    [
      { id: "enc", name: "ENC" },
      { id: "paper", name: "Paper Charts" },
    ]
  );
  assert.deepEqual(
    groups.map((g) => [g.id, g.workspaces.length]),
    [
      ["enc", 1],
      ["paper", 0],
    ]
  );
});

test("Workspace exclusions are scoped by Pipeline and preserved on reload", () => {
  const previous = groupWorkspacePipelines([
    workspace("enc", "ENC", "east", "Eastern Denmark"),
    workspace("paper", "Paper", "east", "Eastern Denmark"),
  ]);
  const next = groupWorkspacePipelines([
    workspace("enc", "ENC", "east", "Eastern Denmark"),
    workspace("paper", "Paper", "east", "Eastern Denmark"),
    workspace("enc", "ENC", "west", "Western Denmark"),
  ]);
  const selection = new Set([workspaceSelectionKey(previous[1].workspaces[0])]);
  const keys = preserveWorkspaceSelection(next, previous, selection);
  assert.equal(keys.includes(workspaceSelectionKey(previous[0].workspaces[0])), false);
  assert.equal(keys.includes(workspaceSelectionKey(previous[1].workspaces[0])), true);
  assert.equal(keys.includes(workspaceSelectionKey(next[0].workspaces[1])), true);
  assert.equal(visibleWorkspacePipelines(next, ["enc", "paper"], keys).length, 2);
});
