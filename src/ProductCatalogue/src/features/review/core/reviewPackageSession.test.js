import assert from "node:assert/strict";
import test from "node:test";
import { createReviewProductSession } from "./reviewProductSession.js";
import { resolveReviewComposition } from "../services/reviewWorkUnitResolver.js";
import { loadReviewHistories } from "../services/reviewHistoryLoader.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
import { createReviewProductItems, toggleReviewProductItem } from "../domain/reviewProductList.js";
import { createReviewPackageFixture, packageNames, deferred, waitForReview } from "../testSupport/reviewPackageFixture.js";

async function harness(t, { initial = [...packageNames, "Simple A"] } = {}) {
  const h = createReviewPackageFixture();
  let items = [];
  let state;
  const routes = [];
  const primes = [];
  const session = createReviewProductSession({
    resolveItems: (input, options) => resolveReviewComposition(input, { ...h.options, ...options }),
    onComposition: (next) => { items = next; routes.push(next.map((item) => item.datasetName)); return next; },
    prepare: async (names) => primes.push([...names]),
    loadProduct: async (name, { resolution } = {}) => {
      const [product] = await loadReviewHistories([name], { ...h.options, ...(resolution ? { resolutions: [resolution] } : {}) });
      return product;
    },
    onChange: (value) => { state = value; },
  });
  t.after(() => session.destroy());
  await session.reconcile(createReviewProductItems(initial), { full: true });
  return { ...h, session, routes, primes,
    get state() { return state; }, get items() { return items; },
  };
}

test("one canonical record primes once and alias addition performs no logical reads", async (t) => {
  const h = await harness(t);
  assert.deepEqual(h.primes, [[packageNames[0], "Simple A"]]);
  const before = JSON.stringify(h.calls);
  const old = h.state.products[0];
  await h.session.reconcile([...h.items, { datasetName: packageNames[1] }]);
  assert.equal(JSON.stringify(h.calls), before);
  assert.equal(h.items.length, 2);
  assert.equal(h.state.products[0], old);
  assert.deepEqual(h.routes.at(-1), [packageNames[0], "Simple A"]);
});

test("freshness reloads the whole package atomically without reading the ordinary Product", async (t) => {
  const h = await harness(t);
  const old = h.state.products[0];
  const ordinary = h.state.products[1];
  const gate = deferred();
  h.controls.artifactGate = gate;
  h.controls.edition = 4;
  const pending = h.session.refresh([packageNames[0]]);
  await waitForReview(() => h.calls.artifacts.length >= 4);
  assert.equal(h.state.products[0], old);
  gate.resolve();
  assert.equal(await pending, true);
  assert.equal(h.state.products[0].members[0].edition, 4);
  assert.equal(h.state.products[1], ordinary);
  assert.equal(h.calls.exact.filter((name) => name === "Simple A").length, 1);
  assert.deepEqual(h.calls.history, [...packageNames, ...packageNames]);
});

for (const failure of ["missing", "remapped", "failExact"]) {
  test(`failed targeted ${failure} retains the last complete accepted package and retries`, async (t) => {
    const h = await harness(t);
    const old = h.state.products[0];
    h.controls[failure] = failure === "remapped" ? true : packageNames[1];
    assert.equal(await h.session.refresh([packageNames[0]]), false);
    assert.equal(h.state.products[0].members, old.members);
    assert.ok(h.state.products[0].refreshError);
    h.controls[failure] = failure === "remapped" ? false : null;
    assert.equal(await h.session.refresh([packageNames[0]]), true);
    assert.equal(h.state.products[0].refreshError, undefined);
  });
}

for (const [edit, rejected] of ["remove", "remove-readd", "disable", "replace", "refresh", "destroy"]
  .flatMap((edit) => [false, true].map((rejected) => [edit, rejected]))) {
  test(`superseded package member completion cannot publish after ${edit} (rejected: ${rejected})`, async (t) => {
    const h = await harness(t);
    const gate = deferred();
    h.controls.artifactGate = gate;
    const pending = h.session.refresh([packageNames[0]]);
    await waitForReview(() => h.calls.artifacts.length >= 4);
    h.controls.artifactGate = null;
    if (edit === "remove" || edit === "remove-readd") await h.session.reconcile(createReviewProductItems(["Simple A"]));
    if (edit === "remove-readd") await h.session.reconcile(createReviewProductItems(["Simple A", packageNames[0]]));
    if (edit === "disable") await h.session.reconcile(toggleReviewProductItem(h.items, packageNames[0].toUpperCase(), false));
    if (edit === "replace") await h.session.reconcile(createReviewProductItems(["Simple B"]), { full: true });
    if (edit === "refresh") await h.session.reconcile(h.items, { full: true });
    if (edit === "destroy") h.session.destroy();
    const accepted = h.state;
    if (rejected) gate.reject(new Error("Superseded member failure"));
    else gate.resolve();
    assert.equal(await pending, false);
    assert.equal(h.state, accepted);
  });
}

test("delayed canonicalization cannot update a newer route or prime stale member identities", async (t) => {
  const h = await harness(t, { initial: ["Simple A"] });
  const gate = deferred();
  h.controls.detailGate = gate;
  const pending = h.session.reconcile(createReviewProductItems(["Simple A", packageNames[1]]));
  await waitForReview(() => h.calls.detail.length > 0);
  await h.session.reconcile(createReviewProductItems(["Simple B"]), { full: true });
  const accepted = h.state;
  gate.resolve();
  assert.equal(await pending, false);
  assert.equal(h.state, accepted);
  assert.deepEqual(h.routes.at(-1), ["Simple B"]);
  assert.deepEqual(h.primes, [["Simple A"], ["Simple B"]]);
  assert.deepEqual(h.calls.history, []);
});

test("rapid composition additions retain pending intent and share the same canonicalization read", async (t) => {
  const h = await harness(t, { initial: ["Simple A"] });
  const gate = deferred();
  h.controls.detailGate = gate;
  const first = h.session.reconcile(createReviewProductItems(["Simple A", packageNames[1]]));
  await waitForReview(() => h.calls.detail.length > 0);
  const second = h.session.reconcile([...h.session.getItems(), { datasetName: "Simple B" }, { datasetName: packageNames[0] }]);
  h.controls.detailGate = null;
  gate.resolve();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(h.routes.at(-1), ["Simple A", packageNames[0], "Simple B"]);
  assert.equal(h.calls.exact.filter((name) => name === packageNames[1]).length, 1);
  assert.equal(h.calls.exact.filter((name) => name === packageNames[0]).length, 1);
  assert.deepEqual(h.calls.history, packageNames);
});

test("FI-022 canonical prime and failed-refresh acknowledgement preserve retry semantics", async (t) => {
  const h = await harness(t);
  let revision = "1";
  const observations = [];
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => h.items.filter((item) => item.enabled).map((item) => item.datasetName),
    getRetainedDatasetNames: () => h.items.map((item) => item.datasetName),
    fetchFreshness: async (names) => {
      observations.push([...names]);
      return names.map((datasetName) => ({ datasetName, available: true, revision: datasetName === packageNames[0] ? revision : "1" }));
    }, onChanged: (names) => h.session.refresh(names), documentRef: null, setIntervalFn: null,
  });
  t.after(() => monitor.destroy());
  await monitor.prime();
  revision = "2";
  h.controls.missing = packageNames[1];
  assert.equal(await monitor.check(), false);
  h.controls.missing = null;
  assert.equal(await monitor.check(), true);
  const count = h.calls.history.length;
  assert.equal(await monitor.check(), true);
  assert.equal(h.calls.history.length, count);
  assert.ok(observations.every((names) => !names.includes(packageNames[1])));
  assert.equal(h.calls.exact.filter((name) => name === "Simple A").length, 1);
});

test("targeted mapping drift during member reads retains the accepted complete package", async (t) => {
  const h = await harness(t);
  const accepted = h.state.products[0];
  const gate = deferred();
  h.controls.artifactGate = gate;
  const pending = h.session.refresh([packageNames[0]]);
  await waitForReview(() => h.calls.artifacts.length >= 4);
  h.controls.remapped = true;
  gate.resolve();
  assert.equal(await pending, false);
  assert.equal(h.state.products[0].members, accepted.members);
  assert.match(h.state.products[0].refreshError, /mapping changed/);
});
