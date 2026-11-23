import test from "node:test";
import assert from "node:assert/strict";
import { applyDraft, assignmentDraftError, createDraft, isDirty } from "./assignmentDraft.js";

const record = {
  relations: {
    enc: {
      active: true,
      workspaces: [{ id: "ws1", name: "Kattegat" }],
      comments: [],
    },
    chart: { active: false, workspaces: [], comments: [] },
  },
};

test("Draft holds Pipeline bindings and comments, not manual Workspace state", () => {
  const draft = createDraft(record);
  assert.deepEqual(draft, { activeIds: ["enc"], comments: [] });
  assert.equal(isDirty(record, draft), false);
  assert.equal(assignmentDraftError(draft), "");
});

test("Only Pipeline and comment edits mark the draft dirty", () => {
  const draft = createDraft(record);
  draft.activeIds.push("chart");
  assert.equal(isDirty(record, draft), true);
  draft.activeIds.pop();
  draft.comments.push({ id: "comment", workStreamId: "enc", text: "Review" });
  assert.equal(isDirty(record, draft), true);
  assert.match(assignmentDraftError(draft, { allowComments: false }), /draft-only/);
});

test("Applying a Pipeline draft preserves authoritative Workspace membership", () => {
  const draft = createDraft(record);
  draft.activeIds.push("chart");
  const next = applyDraft(record, draft, {
    author: "Tester",
    createdAt: "now",
    createId: () => "c1",
  });
  assert.equal(next.relations.enc.active, true);
  assert.deepEqual(next.relations.enc.workspaces, [{ id: "ws1", name: "Kattegat" }]);
  assert.equal(next.relations.chart.active, true);
  assert.deepEqual(record.relations.chart.active, false);
});
