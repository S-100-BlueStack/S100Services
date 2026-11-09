import test from "node:test";
import assert from "node:assert/strict";
import {
  savedWorkspaceSelected,
  workspacePreviewChangeCount,
  workspacePreviewSelection,
  withWorkspacePreviewSelection,
} from "./workspacePreview.js";
import { assignmentDraftError, createDraft, isDirty } from "./assignmentDraft.js";

const record = {
  relations: {
    east: {
      active: true,
      workspaces: [{ id: "auto-1", name: "Auto" }],
    },
  },
};

test("Saved automatic Workspace matches are checked without a draft change", () => {
  const draft = createDraft(record);
  assert.equal(savedWorkspaceSelected(record, "east", "auto-1"), true);
  assert.deepEqual(workspacePreviewSelection(record, draft, "east", "auto-1"), {
    automatic: true,
    selected: true,
  });
  assert.deepEqual(workspacePreviewSelection(record, draft, "east", "manual-2"), {
    automatic: false,
    selected: false,
  });
  assert.equal(isDirty(record, draft), false);
});

test("Preview can exclude an auto-match and include a Workspace outside the automatic set", () => {
  const draft = createDraft(record);
  draft.workspaceOverrides = withWorkspacePreviewSelection(record, draft, "east", "auto-1", false);
  draft.workspaceOverrides = withWorkspacePreviewSelection(record, draft, "east", "manual-2", true);
  assert.deepEqual(draft.workspaceOverrides, { east: { "auto-1": false, "manual-2": true } });
  assert.deepEqual(workspacePreviewSelection(record, draft, "east", "auto-1"), {
    automatic: true,
    selected: false,
  });
  assert.deepEqual(workspacePreviewSelection(record, draft, "east", "manual-2"), {
    automatic: false,
    selected: true,
  });
  assert.equal(workspacePreviewChangeCount(draft, "east"), 2);
  assert.equal(isDirty(record, draft), true);
  assert.match(assignmentDraftError(draft), /preview-only/);
  // The backend record is never mutated when editing preview checkboxes.
  assert.equal(record.relations.east.workspaces.length, 1);
});

test("Returning each Workspace to its automatic state removes the draft override", () => {
  const draft = createDraft(record);
  draft.workspaceOverrides = withWorkspacePreviewSelection(record, draft, "east", "auto-1", false);
  draft.workspaceOverrides = withWorkspacePreviewSelection(record, draft, "east", "auto-1", true);
  assert.deepEqual(draft.workspaceOverrides, {});
  assert.equal(isDirty(record, draft), false);
  assert.equal(assignmentDraftError(draft), "");
});

test("External Pipeline and Workspace identifiers never mutate object prototypes", () => {
  const original = createDraft(record);
  const scoped = withWorkspacePreviewSelection(record, original, "__proto__", "constructor", true);
  assert.equal(Object.hasOwn(scoped, "__proto__"), true);
  assert.equal(Object.hasOwn(scoped.__proto__, "constructor"), true);
  assert.equal({}.constructor, Object);
  assert.equal(scoped.__proto__.constructor, true);
  assert.equal(
    workspacePreviewSelection(record, { workspaceOverrides: scoped }, "__proto__", "constructor")
      .selected,
    true
  );
});
