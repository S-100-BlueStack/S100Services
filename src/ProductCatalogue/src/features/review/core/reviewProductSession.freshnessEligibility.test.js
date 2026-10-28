import assert from "node:assert/strict";
import test from "node:test";
import { createReviewProductSession } from "./reviewProductSession.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
import {
  addReviewProductItem,
  createReviewProductItems,
  removeReviewProductItem,
  toggleReviewProductItem,
} from "../domain/reviewProductList.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function harness(t) {
  let items = createReviewProductItems(["A", "B"]);
  let state;
  let nextObservation = null;
  let nextLoad = null;
  const revisions = { A: "1", B: "1" };
  const calls = [];
  const acknowledgements = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => items.filter((item) => item.enabled).map((item) => item.datasetName),
    getRetainedDatasetNames: () => items.map((item) => item.datasetName),
    fetchFreshness: async (names) => {
      const response = names.map((datasetName) => ({
        datasetName,
        available: true,
        revision: revisions[datasetName],
      }));
      const pending = nextObservation;
      nextObservation = null;
      if (pending) {
        pending.started.resolve();
        await pending.release.promise;
      }
      return response;
    },
    onChanged: async (names) => {
      const accepted = await session.refresh(names);
      acknowledgements.push({ names, accepted });
      return accepted;
    },
    documentRef: null,
    setIntervalFn: null,
  });
  const session = createReviewProductSession({
    prepare: (names, { full }) => (full ? monitor.prime(names) : monitor.primeAdditional(names)),
    loadProduct: async (datasetName) => {
      calls.push(datasetName);
      const payload = {
        datasetName,
        productContext: { datasetName, sourceId: "source", productKey: datasetName },
        loadState: "loaded",
        history: { revision: revisions[datasetName] },
      };
      const pending = nextLoad;
      nextLoad = null;
      if (pending) {
        pending.started.resolve();
        await pending.release.promise;
      }
      return payload;
    },
    onChange: (value) => {
      state = value;
    },
  });
  t.after(() => {
    session.destroy();
    monitor.destroy();
  });
  await session.reconcile(items, { full: true });
  const reconcile = async (nextItems) => {
    items = nextItems;
    monitor.retain();
    await session.reconcile(items);
  };
  return {
    session,
    monitor,
    revisions,
    calls,
    acknowledgements,
    get state() {
      return state;
    },
    toggle: (enabled) => reconcile(toggleReviewProductItem(items, "B", enabled)),
    remove: () => reconcile(removeReviewProductItem(items, "B")),
    readd: () => reconcile(addReviewProductItem(items, "B")),
    replace: async () => {
      items = createReviewProductItems(["A"]);
      monitor.retain();
      await session.reconcile(items, { full: true });
    },
    deferObservation() {
      nextObservation = { started: deferred(), release: deferred() };
      return nextObservation;
    },
    deferLoad() {
      nextLoad = { started: deferred(), release: deferred() };
      return nextLoad;
    },
    // Probe the monitor's first-observation contract without an additional prime:
    // a removed Product must no longer have a revision baseline to compare with.
    observeRemovedNameAgain() {
      items = createReviewProductItems(["A", "B"]);
      return monitor.check();
    },
  };
}

for (const requested of [["B"], ["A", "B"]]) {
  test(`session declines the complete changed set ${requested} when B is disabled`, async (t) => {
    const h = await harness(t);
    const cachedB = h.state.products[1];
    await h.toggle(false);
    assert.equal(await h.session.refresh(requested), false);
    assert.deepEqual(h.calls, ["A", "B"]);
    await h.toggle(true);
    assert.equal(h.state.products[1], cachedB);
    assert.deepEqual(h.calls, ["A", "B"]);
  });
}

for (const mixed of [false, true]) {
  test(`in-flight freshness preserves disabled B's revision obligation${mixed ? " in a mixed set" : ""}`, async (t) => {
    const h = await harness(t);
    const cachedB = h.state.products[1];
    h.revisions.B = "2";
    if (mixed) h.revisions.A = "2";
    const observation = h.deferObservation();
    const check = h.monitor.check();
    await observation.started.promise;
    await h.toggle(false);
    observation.release.resolve();
    assert.equal(await check, false);
    assert.deepEqual(h.acknowledgements, []);
    assert.deepEqual(h.calls, ["A", "B"]);

    // The stale observation is discarded before onChanged. A surviving changed
    // Product remains eligible for the next normal current-composition check.
    assert.equal(await h.monitor.check(), true);
    assert.deepEqual(h.acknowledgements, mixed ? [{ names: ["A"], accepted: true }] : []);
    assert.deepEqual(h.calls, mixed ? ["A", "B", "A"] : ["A", "B"]);
    await h.toggle(true);
    assert.equal(h.state.products[1], cachedB);
    const load = h.deferLoad();
    const retry = h.monitor.check();
    await load.started.promise;
    assert.equal(h.state.products[1], cachedB);
    assert.equal(h.calls.filter((name) => name === "B").length, 2);
    assert.equal(
      h.acknowledgements.some((entry) => entry.accepted && entry.names.includes("B")),
      false
    );
    load.release.resolve();
    assert.equal(await retry, true);
    assert.equal(h.state.products[1].history.revision, "2");
    assert.deepEqual(h.acknowledgements.at(-1), { names: ["B"], accepted: true });
    const count = h.calls.length;
    assert.equal(await h.monitor.check(), true);
    assert.equal(h.calls.length, count);
  });
}

test("disable then re-enable invalidates the old observation and retries current B", async (t) => {
  const h = await harness(t);
  const cachedB = h.state.products[1];
  h.revisions.B = "2";
  const observation = h.deferObservation();
  const check = h.monitor.check();
  await observation.started.promise;
  await h.toggle(false);
  await h.toggle(true);
  observation.release.resolve();
  assert.equal(await check, false);
  assert.deepEqual(h.acknowledgements, []);
  assert.deepEqual(h.calls, ["A", "B"]);
  assert.equal(h.state.products[1], cachedB);

  assert.equal(await h.monitor.check(), true);
  assert.deepEqual(h.calls, ["A", "B", "B"]);
  assert.deepEqual(h.acknowledgements, [{ names: ["B"], accepted: true }]);
  assert.equal(h.state.products[1].history.revision, "2");
  await h.monitor.check();
  assert.deepEqual(h.calls, ["A", "B", "B"]);
});

test("removal during an observation neither reloads B nor retains obsolete revision bookkeeping", async (t) => {
  const h = await harness(t);
  h.revisions.B = "2";
  const observation = h.deferObservation();
  const check = h.monitor.check();
  await observation.started.promise;
  await h.remove();
  observation.release.resolve();
  await check;
  assert.deepEqual(h.calls, ["A", "B"]);
  assert.deepEqual(
    h.state.products.map((product) => product.datasetName),
    ["A"]
  );
  assert.deepEqual(h.acknowledgements, []);
  h.revisions.B = "3";
  assert.equal(await h.observeRemovedNameAgain(), true);
  assert.deepEqual(h.acknowledgements, []);
  assert.deepEqual(h.calls, ["A", "B"]);
});

test("full replacement supersedes an in-flight changed observation", async (t) => {
  const h = await harness(t);
  h.revisions.B = "2";
  const observation = h.deferObservation();
  const check = h.monitor.check();
  await observation.started.promise;
  await h.replace();
  observation.release.resolve();
  assert.equal(await check, false);
  assert.deepEqual(h.calls, ["A", "B", "A"]);
  assert.deepEqual(h.acknowledgements, []);
  assert.deepEqual(
    h.state.products.map((product) => product.datasetName),
    ["A"]
  );
});

test("disabling B while its Product refresh is pending also declines acknowledgement", async (t) => {
  const h = await harness(t);
  h.revisions.B = "2";
  const load = h.deferLoad();
  const check = h.monitor.check();
  await load.started.promise;
  await h.toggle(false);
  load.release.resolve();
  assert.equal(await check, false);
  assert.deepEqual(h.acknowledgements, [{ names: ["B"], accepted: false }]);
  await h.toggle(true);
  assert.equal(await h.monitor.check(), true);
  assert.deepEqual(h.calls, ["A", "B", "B", "B"]);
  await h.monitor.check();
  assert.deepEqual(h.calls, ["A", "B", "B", "B"]);
});

test("stale freshness observation cannot cross B remove and re-add membership", async (t) => {
  const h = await harness(t);
  h.revisions.B = "2";
  const observation = h.deferObservation();
  const staleCheck = h.monitor.check();
  await observation.started.promise;

  await h.remove();
  h.revisions.B = "3";
  await h.readd();
  assert.deepEqual(h.calls, ["A", "B", "B"]);
  assert.equal(h.state.products[1].history.revision, "3");

  observation.release.resolve();
  assert.equal(await staleCheck, false);
  assert.deepEqual(h.acknowledgements, []);

  const callCount = h.calls.length;
  assert.equal(await h.monitor.check(), true);
  assert.equal(h.calls.length, callCount);
  assert.deepEqual(h.acknowledgements, []);
  assert.equal(h.state.products[1].history.revision, "3");
});
