import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_ASSIGNMENT_PAGE_TARGETS,
  createRequiredTargetGetter,
} from "./assignmentPageContract.js";

test("Assignment page initialization validates every declared render target", () => {
  const nodes = new Map(REQUIRED_ASSIGNMENT_PAGE_TARGETS.map((name) => [name, { name }]));
  const get = createRequiredTargetGetter((name) => nodes.get(name));
  assert.equal(get("work-stream-panel").name, "work-stream-panel");
});

test("Assignment page initialization fails clearly when a required target disappears", () => {
  assert.throws(
    () => createRequiredTargetGetter((name) => (name === "work-stream-status" ? null : { name })),
    /work-stream-status/
  );
});

test("Work stream name search is not part of the assignment-page render contract", () => {
  assert.equal(REQUIRED_ASSIGNMENT_PAGE_TARGETS.includes("work-stream-search"), false);
});

test("Work stream pagination targets are not part of the assignment-page contract", () => {
  assert.equal(REQUIRED_ASSIGNMENT_PAGE_TARGETS.includes("work-stream-prev"), false);
  assert.equal(REQUIRED_ASSIGNMENT_PAGE_TARGETS.includes("work-stream-page"), false);
  assert.equal(REQUIRED_ASSIGNMENT_PAGE_TARGETS.includes("work-stream-next"), false);
});
