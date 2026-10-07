import assert from "node:assert/strict";
import test from "node:test";
import { createPackagePopupFreshness } from "./packagePopupFreshness.js";
function harness(refresh) {
  const calls = [];
  let changed;
  const session = createPackagePopupFreshness({
    datasetName: "PRIMARY",
    refresh: async () => {
      calls.push("read");
      return refresh();
    },
    createFreshnessMonitor(options) {
      assert.deepEqual(options.getDatasetNames(), ["PRIMARY"]);
      changed = options.onChanged;
      return {
        prime: async () => {
          calls.push("prime");
        },
        check: async () => {
          calls.push("check");
        },
        start: () => calls.push("start"),
        destroy: () => calls.push("destroy"),
        requireRefresh: () => calls.push("recover"),
      };
    },
  });
  return { session, calls, changed: () => changed() };
}
test("prime precedes initial read and race check; repeated starts share initialization", async () => {
  const h = harness(() => true);
  assert.equal(h.session.start(), h.session.start());
  await h.session.start();
  assert.deepEqual(h.calls, ["prime", "read", "check", "start"]);
});
test("concurrent changed triggers share one detail read and require accepted completion", async () => {
  let finish;
  const h = harness(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const a = h.changed();
  const b = h.changed();
  assert.equal(a, b);
  await Promise.resolve();
  finish(false);
  assert.equal(await a, false);
  assert.deepEqual(h.calls, ["read"]);
});
test("initial failed detail read marks unchanged revision for recovery", async () => {
  const h = harness(() => false);
  await h.session.start();
  assert.deepEqual(h.calls, ["prime", "read", "recover", "check", "start"]);
});
test("disconnect invalidates an in-flight detail and destroys monitor", async () => {
  let finish;
  const h = harness(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const request = h.changed();
  await Promise.resolve();
  h.session.destroy();
  finish(true);
  assert.equal(await request, false);
  assert.equal(await h.changed(), false);
  assert.deepEqual(h.calls, ["read", "destroy"]);
});
test("disconnect during prime prevents detail and timer start", async () => {
  const h = harness(() => true);
  const ready = h.session.start();
  h.session.destroy();
  await ready;
  assert.deepEqual(h.calls, ["prime", "destroy"]);
});
