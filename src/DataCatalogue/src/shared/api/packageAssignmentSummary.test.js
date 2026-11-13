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

test("explicitly empty bindings mean Not assigned", () => {
  assert.deepEqual(
    normalizePackageAssignmentSummary({ hasPipeline: false, pipelineBindings: [] }),
    { status: "Not assigned", pipelineIds: [] }
  );
});

test("partial or contradictory binding summaries fail closed", () => {
  const bad = [
    { hasPipeline: true },
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
