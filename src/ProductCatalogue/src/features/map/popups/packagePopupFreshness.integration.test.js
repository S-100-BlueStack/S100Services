import assert from "node:assert/strict";
import test from "node:test";
import { createPackagePopupFreshness } from "./packagePopupFreshness.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
function harness() {
  let revision = "a";
  let reads = 0;
  let pings = 0;
  let refresh = async () => true;
  let tick;
  let listener;
  let cleared = false;
  let cadence;
  let monitor;
  const documentRef = {
    hidden: false,
    addEventListener(_, fn) {
      listener = fn;
    },
    removeEventListener(_, fn) {
      if (listener === fn) listener = null;
    },
  };
  const session = createPackagePopupFreshness({
    datasetName: "PRIMARY",
    refresh: async () => {
      reads++;
      return refresh();
    },
    createFreshnessMonitor: (options) =>
      (monitor = createWorkspaceFreshnessMonitor({
        ...options,
        documentRef,
        fetchFreshness: async () => {
          pings++;
          return [{ datasetName: "PRIMARY", available: true, revision }];
        },
        setIntervalFn: (fn, ms) => {
          tick = fn;
          cadence = ms;
          return 1;
        },
        clearIntervalFn: () => {
          cleared = true;
        },
      })),
  });
  return {
    session,
    documentRef,
    setRevision: (value) => {
      revision = value;
    },
    setRefresh: (fn) => {
      refresh = fn;
    },
    check: () => monitor.check(),
    tick: () => tick(),
    visible: () => listener?.(),
    snapshot: () => ({ reads, pings, cleared, cadence, listening: Boolean(listener) }),
  };
}
test("real monitor uses 30 seconds and unchanged revision avoids detail", async () => {
  const h = harness();
  await h.session.start();
  assert.deepEqual(h.snapshot(), {
    reads: 1,
    pings: 2,
    cleared: false,
    cadence: 30_000,
    listening: true,
  });
  h.tick();
  await h.check();
  assert.equal(h.snapshot().reads, 1);
  h.session.destroy();
  assert.equal(h.snapshot().cleared, true);
  assert.equal(h.snapshot().listening, false);
});
test("real monitor catches revision change racing initial detail", async () => {
  const h = harness();
  h.setRefresh(async () => {
    h.setRevision("b");
    return true;
  });
  await h.session.start();
  assert.equal(h.snapshot().reads, 2);
  h.session.destroy();
});
test("changed revision, interval and visibility triggers share one request", async () => {
  const h = harness();
  await h.session.start();
  let finish;
  h.setRefresh(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  h.setRevision("b");
  h.tick();
  h.visible();
  const pending = h.check();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.snapshot().reads, 2);
  assert.equal(h.snapshot().pings, 3);
  finish(true);
  await pending;
  await h.check();
  assert.equal(h.snapshot().reads, 2);
  h.session.destroy();
});
test("hidden document suppresses ping and visible reentry revalidates once", async () => {
  const h = harness();
  await h.session.start();
  h.documentRef.hidden = true;
  h.setRevision("b");
  h.tick();
  await h.check();
  assert.equal(h.snapshot().pings, 2);
  h.documentRef.hidden = false;
  h.visible();
  await h.check();
  assert.equal(h.snapshot().reads, 2);
  assert.equal(h.snapshot().pings, 3);
  h.session.destroy();
});
test("failed detail leaves changed revision unacknowledged", async () => {
  const h = harness();
  await h.session.start();
  h.setRevision("b");
  h.setRefresh(async () => false);
  assert.equal(await h.check(), false);
  h.setRefresh(async () => true);
  assert.equal(await h.check(), true);
  assert.equal(h.snapshot().reads, 3);
  await h.check();
  assert.equal(h.snapshot().reads, 3);
  h.session.destroy();
});
test("close during detail cannot acknowledge revision or restart listeners", async () => {
  const h = harness();
  await h.session.start();
  h.setRevision("b");
  let finish;
  h.setRefresh(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = h.check();
  await new Promise((resolve) => setImmediate(resolve));
  h.session.destroy();
  finish(true);
  assert.equal(await pending, false);
  assert.equal(h.snapshot().listening, false);
  assert.equal(await h.check(), false);
});
