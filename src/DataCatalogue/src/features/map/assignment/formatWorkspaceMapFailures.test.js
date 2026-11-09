import test from "node:test";
import assert from "node:assert/strict";
import { formatWorkspaceMapFailures } from "./formatWorkspaceMapFailures.js";

test("Successful and empty maps have no redundant footer copy", () => {
  assert.equal(formatWorkspaceMapFailures({ failures: [] }), "");
});

test("Map failures retain affected Workspace names and actionable errors", () => {
  assert.equal(
    formatWorkspaceMapFailures({
      failures: [{ workspace: { name: "Kattegat" }, message: "Projection failed" }],
    }),
    "Kattegat: Projection failed"
  );
});
