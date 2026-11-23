import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSIGNMENT_SAVED_WORKSPACE_OUTLINE,
  createAssignmentWorkspaceSymbol,
} from "./workspaceCoverageSymbol.js";
import { WORKSPACE_JOB_COLOR_LEVELS } from "./workspaceJobColors.js";

test("Saved assignment Workspace matches use a solid orange outline", () => {
  const symbol = createAssignmentWorkspaceSymbol();
  assert.equal(symbol.type, "simple-fill");
  assert.equal(symbol.outline.style, "solid");
  assert.deepEqual(symbol.outline.color.slice(0, 3), [245, 141, 35]);
  assert.deepEqual(symbol.outline.color.slice(0, 3), ASSIGNMENT_SAVED_WORKSPACE_OUTLINE.rgb);
  assert.ok(symbol.color[3] > 0 && symbol.color[3] < 0.1);
  assert.ok(symbol.outline.width >= 2);
  for (const level of WORKSPACE_JOB_COLOR_LEVELS) {
    assert.notDeepEqual(symbol.outline.color.slice(0, 3), level.rgb);
  }
  symbol.outline.color[0] = 0;
  assert.deepEqual(
    createAssignmentWorkspaceSymbol().outline.color.slice(0, 3),
    ASSIGNMENT_SAVED_WORKSPACE_OUTLINE.rgb,
    "Each graphic must get an independent symbol"
  );
});
