import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceCoverageStatus } from "./createWorkspaceCoverageStatus.js";

function fixture() {
  const events = new Map();
  const statuses = [];
  const notices = [];
  let removed = 0;
  const controller = createWorkspaceCoverageStatus({
    view: {
      on(name, callback) {
        events.set(name, callback);
        return {
          remove() {
            events.delete(name);
            removed++;
          },
        };
      },
    },
    layerId: "workspace-coverage",
    onStatus: (state) => statuses.push(state),
    onCoverageError: (message) => notices.push(message),
  });
  return {
    controller,
    statuses,
    notices,
    events,
    emit(name, layerId = "workspace-coverage") {
      events.get(name)?.({ layer: { id: layerId } });
    },
    removed: () => removed,
  };
}

const ready = { status: "ready", count: 1, total: 1, failures: [] };
const failed = {
  status: "error",
  count: 0,
  total: 1,
  failures: [{ workspace: { pipelineId: "P", workspaceId: "W" }, message: "Invalid polygon" }],
};

test("LayerView creation failure emits one visible notice even after successful geometry preparation", () => {
  const f = fixture();
  f.controller.onOverlayStatus(ready);
  f.emit("layerview-create-error", "unrelated-layer");
  assert.equal(f.notices.length, 0);
  f.emit("layerview-create-error");
  f.emit("layerview-create-error");
  f.controller.onOverlayStatus(ready);

  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0], /Workspace rendering failed/);
  assert.equal(f.statuses.at(-1).status, "error");
  assert.match(f.statuses.at(-1).message, /rendering failed/);
  f.controller.remove();
});

test("Only a matching successful LayerView creation clears the render failure", () => {
  const f = fixture();
  f.controller.onOverlayStatus(ready);
  f.emit("layerview-create-error");
  f.emit("layerview-create", "unrelated-layer");
  assert.equal(f.statuses.at(-1).status, "error");
  f.emit("layerview-create");
  assert.equal(f.statuses.at(-1).status, "ready");
  f.emit("layerview-create-error");
  assert.equal(f.notices.length, 2);
  f.controller.remove();
});

test("Overlay transport/projection errors use the same deduplicated visible boundary", () => {
  const f = fixture();
  f.controller.onOverlayStatus(failed);
  f.controller.onOverlayStatus(failed);
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0], /Invalid polygon/);
  assert.equal(f.statuses.at(-1).status, "error");
  f.controller.onOverlayStatus(ready);
  assert.equal(f.statuses.at(-1).status, "ready");
  f.controller.onOverlayStatus(failed);
  assert.equal(f.notices.length, 2);
  f.controller.remove();
});

test("A render error stays visible while the overlay reports ready, and recovery retains independent failures", () => {
  const f = fixture();
  f.controller.onOverlayStatus(ready);
  f.emit("layerview-create-error");
  f.controller.onOverlayStatus(failed);
  assert.equal(f.notices.length, 1);
  assert.equal(f.statuses.at(-1).status, "error");
  f.emit("layerview-create");
  assert.equal(f.statuses.at(-1).status, "error");
  assert.equal(f.notices.length, 2);
  assert.match(f.notices.at(-1), /Invalid polygon/);
  f.controller.remove();
});

test("Teardown detaches both SDK event handles and stops stale status publication", () => {
  const f = fixture();
  const handler = f.events.get("layerview-create-error");
  f.controller.remove();
  handler({ layer: { id: "workspace-coverage" } });
  f.controller.onOverlayStatus(failed);
  assert.equal(f.notices.length, 0);
  assert.equal(f.statuses.length, 0);
  assert.equal(f.removed(), 2);
  assert.equal(f.events.size, 0);
});
