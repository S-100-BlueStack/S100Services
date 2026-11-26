import test from "node:test";
import assert from "node:assert/strict";
import { normalizePackageAssignmentSummary } from "./packageAssignmentSummary.js";

const binding = (pipelineId, id = `pkg::${pipelineId}`) => ({ id, pipelineId });

test("missing summary remains unknown rather than pretending a Package is unassigned", () => {
  assert.deepEqual(normalizePackageAssignmentSummary({}), { status: null, pipelineIds: null });
});

test("active Pipeline bindings produce assigned status without Workspace intersection", () => {
  assert.deepEqual(
    normalizePackageAssignmentSummary({
      hasPipeline: true,
      pipelineBindings: [binding("ENC"), binding("Paper Charts")],
    }),
    { status: "Assigned", pipelineIds: ["ENC", "Paper Charts"] }
  );
});

test("empty bindings require authoritative status to distinguish Not assigned from Discarded", () => {
  assert.deepEqual(
    normalizePackageAssignmentSummary({ hasPipeline: false, pipelineBindings: [] }),
    { status: null, pipelineIds: [] }
  );
  for (const [assignmentStatus, status] of [
    ["notAssigned", "Not assigned"],
    ["discarded", "Discarded"],
  ]) {
    assert.deepEqual(
      normalizePackageAssignmentSummary({
        hasPipeline: false,
        pipelineBindings: [],
        assignmentStatus,
      }),
      { status, pipelineIds: [], assignmentStatus }
    );
  }
});

test("partial or contradictory binding summaries fail closed", () => {
  const bad = [
    { hasPipeline: true },
    { hasPipeline: true, pipelineBindings: [binding("a")], assignmentStatus: "discarded" },
    { hasPipeline: false, pipelineBindings: [], assignmentStatus: "assigned" },
    { hasPipeline: false, pipelineBindings: [], assignmentStatus: "closed" },
    { pipelineBindings: [] },
    { hasPipeline: null, pipelineBindings: [] },
    { hasPipeline: false, pipelineBindings: [binding("a")] },
    { hasPipeline: true, pipelineBindings: [] },
    { hasPipeline: true, pipelineBindings: [binding("a"), binding("a")] },
    { hasPipeline: true, pipelineBindings: [{ id: "", pipelineId: "a" }] },
    { hasPipeline: true, pipelineBindings: [{ id: "p", pipelineId: "" }] },
    { hasPipeline: true, pipelineBindings: [{}] },
  ];
  for (const item of bad) assert.throws(() => normalizePackageAssignmentSummary(item), /Package/);
});
