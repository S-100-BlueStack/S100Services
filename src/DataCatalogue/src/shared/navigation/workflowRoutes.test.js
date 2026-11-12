import assert from "node:assert/strict";
import test from "node:test";
import { assignmentPath, getApplicationBasePath, parseWorkflowPath } from "./workflowRoutes.js";

test("Package assignment shortcuts encode the canonical identifier without leaving the application", () => {
  assert.equal(assignmentPath("pkg/100%?"), "/assignments/packages/pkg%2F100%25%3F");
  assert.deepEqual(parseWorkflowPath("/assignments/packages/pkg%2F100%25%3F"), {
    assignment: true,
    packageId: "pkg/100%?",
  });
  assert.equal(parseWorkflowPath("/assignments/packages/%ZZ").packageId, null);
});

test("Assignment routes preserve the frontend mount path in IIS subapplications", () => {
  const base = getApplicationBasePath("/catalogue/");
  assert.equal(base, "/catalogue/");
  assert.equal(assignmentPath(null, base), "/catalogue/assignments");
  assert.equal(assignmentPath("a/b", base), "/catalogue/assignments/packages/a%2Fb");
  assert.deepEqual(parseWorkflowPath("/catalogue/assignments/packages/a%2Fb", base), {
    assignment: true,
    packageId: "a/b",
  });
  assert.equal(parseWorkflowPath("/assignments/packages/a%2Fb", base).assignment, false);
  assert.equal(getApplicationBasePath("/catalogue/assignments/packages/a%2Fb"), base);
  assert.equal(getApplicationBasePath("/catalogue/index.html"), base);
  assert.equal(getApplicationBasePath("/catalogue"), base);
  assert.equal(getApplicationBasePath("/"), "/");
  assert.equal(
    assignmentPath("x", getApplicationBasePath("//example.test/")),
    "/example.test/assignments/packages/x"
  );
});
