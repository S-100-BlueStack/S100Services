import test from "node:test";
import assert from "node:assert/strict";
import { liveAssignmentMapContext } from "./liveAssignmentMapContext.js";

const ws = (pipelineId) => ({ pipelineId, workspaceId: "same" });
test("Live assignment coverage uses saved intersecting Workspaces, preserving Pipeline context", () => {
  const record = {
    relations: {
      a: { active: true, workspaces: [ws("a"), ws("a")] },
      b: { active: true, workspaces: [ws("b")] },
      c: { active: false, workspaces: [ws("c")] },
    },
  };
  const feature = { id: "package", geometry: { invented: true } };
  const result = liveAssignmentMapContext(feature, record);
  assert.equal(result.id, "package");
  assert.deepEqual(result.workspaces, [ws("a"), ws("b")]);
  assert.equal(result.geometry, undefined);
  assert.deepEqual(liveAssignmentMapContext(null, record).workspaces, []);
  assert.deepEqual(liveAssignmentMapContext(feature, null).workspaces, []);
  assert.throws(
    () =>
      liveAssignmentMapContext(feature, {
        relations: { a: { active: true, workspaces: [ws("b")] } },
      }),
    /Pipeline binding/
  );
});
