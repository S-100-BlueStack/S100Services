import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceOverlay, workspaceOverlayMessage } from "./createWorkspaceOverlay.js";

const workspace = (pipelineId = "p", workspaceId = "w") => ({ pipelineId, workspaceId });
const context = (id = "a", ws = workspace()) => ({ id, workspaces: [ws] });
const result = (ws = workspace()) => [{ workspace: ws, polygon: { actual: true }, error: null }];
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture({
  load = async () => result(),
  prepare = async (geometry) => geometry,
  focus,
} = {}) {
  const states = [],
    rendered = [],
    focuses = [],
    signals = [],
    visibility = [],
    jobCounts = [];
  let calls = 0,
    clears = 0,
    stops = 0,
    destroys = 0;
  const overlay = createWorkspaceOverlay({
    source: {
      load: (...args) => {
        calls++;
        signals.push(args[1].signal);
        return load(...args);
      },
    },
    renderer: {
      prepare,
      clear: () => {
        clears++;
      },
      replace: (entries) => rendered.push(entries),
      setVisibleWorkspaces: (items) => visibility.push(items),
      setOpenJobCounts: (items) => jobCounts.push(items),
      focus:
        focus ??
        (async (entries, guard) => {
          if (guard.shouldApply()) focuses.push(entries);
        }),
      stop: () => {
        stops++;
      },
      destroy: () => {
        destroys++;
      },
    },
    onStatus: (state) => states.push(state),
  });
  return {
    overlay,
    states,
    rendered,
    focuses,
    signals,
    visibility,
    jobCounts,
    counts: () => ({ calls, clears, stops, destroys }),
  };
}

test("Same-context rerenders do not reload or zoom; explicit Focus navigates without HTTP", async () => {
  const f = fixture();
  await f.overlay.setContext(context());
  await f.overlay.setContext(context());
  assert.equal(f.counts().calls, 1);
  assert.equal(f.focuses.length, 1);
  await f.overlay.focus();
  assert.equal(f.focuses.length, 2);
  assert.equal(f.counts().calls, 1);
  await f.overlay.setContext(context(), { reload: true, autoFocus: false });
  assert.equal(f.counts().calls, 2);
  assert.equal(f.focuses.length, 2);
});

test("New scope aborts old HTTP and clears old overlays before publishing the newer response", async () => {
  const old = deferred();
  const f = fixture({ load: async ([ws]) => (ws.pipelineId === "p" ? old.promise : result(ws)) });
  const pending = f.overlay.setContext(context());
  await f.overlay.setContext(context("b", workspace("q")));
  assert.equal(f.signals[0].aborted, true);
  old.resolve(result());
  await pending;
  assert.equal(f.rendered.length, 1);
  assert.equal(f.rendered[0][0].workspace.pipelineId, "q");
  assert.equal(f.focuses.length, 1);
});

test("Stale projection cannot replace newer graphics or navigate after deselection", async () => {
  const sdk = deferred();
  const f = fixture({ prepare: () => sdk.promise });
  const pending = f.overlay.setContext(context());
  await new Promise(setImmediate);
  await f.overlay.setContext();
  sdk.resolve({ stale: true });
  await pending;
  assert.equal(f.rendered.length, 0);
  assert.equal(f.focuses.length, 0);
  assert.equal(f.states.at(-1).status, "empty");
});

test("Partial geometry and unsupported projection errors retain working Workspace coverage", async () => {
  const f = fixture({
    load: async () => [
      ...result(),
      { workspace: workspace("q"), error: new Error("404 Not Found") },
      { workspace: workspace("r"), polygon: { unsupported: true } },
    ],
    prepare: async (polygon) => {
      if (polygon.unsupported) throw new Error("Unsupported spatial reference");
      return polygon;
    },
  });
  await f.overlay.setContext({
    id: "package",
    workspaces: [workspace(), workspace("q"), workspace("r")],
  });
  assert.equal(f.states.at(-1).status, "partial");
  assert.equal(f.states.at(-1).count, 1);
  assert.equal(f.states.at(-1).failures.length, 2);
  assert.match(workspaceOverlayMessage(f.states.at(-1)), /q \/ w: 404/);
  assert.equal(f.rendered[0].length, 1);
});

test("Teardown suppresses late success, errors, focus and queued SDK publications", async () => {
  const pending = deferred();
  const f = fixture({ load: () => pending.promise });
  const read = f.overlay.setContext(context());
  f.overlay.destroy();
  const count = f.states.length;
  pending.resolve(result());
  await read;
  await f.overlay.focus();
  await f.overlay.setContext(context("later"));
  assert.equal(f.states.length, count);
  assert.equal(f.rendered.length, 0);
  assert.equal(f.signals[0].aborted, true);
  assert.equal(f.counts().destroys, 1);
});

test("Queued navigation receives a guard invalidated by newer context and teardown", async () => {
  const next = deferred();
  let guard;
  const f = fixture({
    focus: async (_entries, options) => {
      guard = options;
      await next.promise;
      assert.equal(guard.shouldApply(), false);
    },
  });
  const read = f.overlay.setContext(context());
  await new Promise(setImmediate);
  await f.overlay.setContext();
  next.resolve();
  await read;
});

test("All-failed geometry returns targeted error and a later reload can recover", async () => {
  let failed = true;
  const f = fixture({
    load: async () => {
      if (failed) throw new Error("API unavailable");
      return result();
    },
  });
  await f.overlay.setContext(context());
  assert.equal(f.states.at(-1).status, "error");
  assert.equal(f.focuses.length, 0);
  failed = false;
  await f.overlay.setContext(context(), { reload: true });
  assert.equal(f.states.at(-1).status, "ready");
});

test("Invalid selected identity clears prior coverage and reports a scoped failure without a request", async () => {
  const f = fixture();
  await f.overlay.setContext(context());
  await f.overlay.setContext({ id: "bad", workspaces: [{ workspaceId: "w" }] });
  assert.equal(f.counts().calls, 1);
  assert.equal(f.counts().clears, 2);
  assert.equal(f.states.at(-1).status, "error");
});

test("Visibility changes and open Job color updates do not re-request or clear Workspace graphics", async () => {
  const f = fixture();
  await f.overlay.setContext(context("catalogue"), { autoFocus: false });
  const before = f.counts();
  f.overlay.setVisibleWorkspaces([]);
  f.overlay.setVisibleWorkspaces([workspace()]);
  f.overlay.setOpenJobCounts(new Map([[JSON.stringify(["p", "w"]), 1]]));
  assert.equal(f.visibility.length, 2);
  assert.equal(f.jobCounts.length, 1);
  assert.deepEqual(f.counts(), before);
  assert.equal(f.rendered.length, 1);
  assert.equal(f.focuses.length, 0);
});
