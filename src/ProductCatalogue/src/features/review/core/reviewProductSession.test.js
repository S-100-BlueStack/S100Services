import assert from "node:assert/strict";
import test from "node:test";
import { createReviewProductSession } from "./reviewProductSession.js";
import {
  addReviewProductItem,
  createReviewProductItems,
  createReviewWorkspaceContentIntent,
  removeReviewProductItem,
  toggleReviewProductContentType,
  toggleReviewProductItem,
  updateReviewWorkspaceContentIntent,
} from "../domain/reviewProductList.js";
import { loadReviewHistories } from "../services/reviewHistoryLoader.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function product(datasetName, sourceId = "source-one") {
  return {
    datasetName,
    sourceId,
    productContext: { sourceId, productKey: datasetName, datasetName },
    loadState: "loaded",
    history: { endpointAvailable: true, events: [datasetName] },
    validationArtifacts: [{ fileName: `${datasetName}.xml` }],
  };
}

function harness(load = async (name) => product(name)) {
  const calls = [];
  const snapshots = [];
  const session = createReviewProductSession({
    loadProduct: (name) => {
      calls.push(name);
      return load(name);
    },
    onChange: (state) => snapshots.push(state),
  });
  return {
    session,
    calls,
    snapshots,
    get state() {
      return snapshots.at(-1);
    },
  };
}

const names = (h) => h.state.products.map((p) => p.datasetName);
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("sequential adds load exactly A, B, C and preserve surviving payload references", async () => {
  const h = harness();
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const a = h.state.products[0];
  await h.session.reconcile(createReviewProductItems(["A", "B"]));
  const b = h.state.products[1];
  await h.session.reconcile(createReviewProductItems(["A", "B", "C"]));
  assert.deepEqual(h.calls, ["A", "B", "C"]);
  assert.equal(h.state.products[0], a);
  assert.equal(h.state.products[1], b);
  assert.deepEqual(names(h), ["A", "B", "C"]);
});

test("remove and disable/enable retain survivors without any Product loads", async () => {
  const h = harness();
  let items = createReviewProductItems(["A", "B", "C"]);
  await h.session.reconcile(items, { full: true });
  const [a, , c] = h.state.products;
  items = removeReviewProductItem(items, "B");
  await h.session.reconcile(items);
  assert.deepEqual(names(h), ["A", "C"]);
  await h.session.reconcile(toggleReviewProductItem(items, "A", false));
  assert.deepEqual(names(h), ["C"]);
  await h.session.reconcile(items);
  assert.deepEqual(h.calls, ["A", "B", "C"]);
  assert.equal(h.state.products[0], a);
  assert.equal(h.state.products[1], c);
});

test("manual full Refresh reloads all enabled Products and invalidates disabled payloads", async () => {
  const h = harness();
  let items = createReviewProductItems(["A", "B", "C"]);
  await h.session.reconcile(items, { full: true });
  items = toggleReviewProductItem(items, "B", false);
  await h.session.reconcile(items, { full: true });
  assert.deepEqual(h.calls, ["A", "B", "C", "A", "C"]);
  await h.session.reconcile(toggleReviewProductItem(items, "B", true));
  assert.deepEqual(h.calls, ["A", "B", "C", "A", "C", "B"]);
});

test("freshness reloads only changed Products, including multiple revisions", async () => {
  const h = harness();
  await h.session.reconcile(createReviewProductItems(["A", "B", "C"]), { full: true });
  const a = h.state.products[0];
  assert.equal(await h.session.refresh(["B"]), true);
  assert.deepEqual(h.calls, ["A", "B", "C", "B"]);
  assert.equal(h.state.products[0], a);
  assert.equal(await h.session.refresh(["B", "C", "C"]), true);
  assert.deepEqual(h.calls, ["A", "B", "C", "B", "B", "C"]);
  assert.deepEqual(names(h), ["A", "B", "C"]);
});

test("FI-038 workspace intent, per-Product overrides and enabled state survive add/remove", async () => {
  const h = harness();
  const intent = updateReviewWorkspaceContentIntent(
    createReviewWorkspaceContentIntent(),
    "history",
    false
  );
  let items = toggleReviewProductItem(createReviewProductItems(["A", "B"]), "A", false);
  items = toggleReviewProductContentType(items, "B", "internal-validation-reports", false);
  await h.session.reconcile(items, { full: true });
  const b = h.state.products[0];
  const before = structuredClone(items);
  items = addReviewProductItem(items, "C", { contentTypeIntent: intent });
  await h.session.reconcile(items);
  assert.deepEqual(items.slice(0, 2), before);
  assert.equal(items[2].contentTypes.history, false);
  assert.equal(items[2].contentTypes["ic-enc-reports"], true);
  assert.equal(items[2].enabled, true);
  items = removeReviewProductItem(items, "A");
  await h.session.reconcile(items);
  assert.equal(h.state.products[0], b);
  assert.equal(items[0].contentTypes["internal-validation-reports"], false);
  assert.equal(intent.history, false);
  assert.deepEqual(h.calls, ["B", "C"]);
});

test("failure of a newly added Product leaves successful History and artifacts intact", async () => {
  const h = harness(async (name) => {
    if (name === "C") throw new Error("C failed");
    return product(name);
  });
  await h.session.reconcile(createReviewProductItems(["A", "B"]), { full: true });
  const successful = [...h.state.products];
  await h.session.reconcile(createReviewProductItems(["A", "B", "C"]));
  assert.equal(h.state.products[0], successful[0]);
  assert.equal(h.state.products[1], successful[1]);
  assert.equal(h.state.products[2].loadState, "failed");
  assert.equal(h.state.products[2].error, "C failed");
  assert.equal(h.state.loading, false);
});

test("add then remove rejects late completion without any publication", async () => {
  const pending = deferred();
  const h = harness((name) => (name === "B" ? pending.promise : Promise.resolve(product(name))));
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const add = h.session.reconcile(createReviewProductItems(["A", "B"]));
  await tick();
  assert.deepEqual(h.calls, ["A", "B"]);
  await h.session.reconcile(createReviewProductItems(["A"]));
  const publications = h.snapshots.length;
  pending.resolve(product("B"));
  await add;
  assert.equal(h.snapshots.length, publications);
  assert.deepEqual(names(h), ["A"]);
  assert.equal(h.state.loading, false);
});

test("removed then re-added Product has a new owner even within the same generation", async () => {
  const old = deferred();
  let count = 0;
  const h = harness((name) =>
    ++count === 1 ? old.promise : Promise.resolve(product(name, "new-source"))
  );
  const first = h.session.reconcile(createReviewProductItems(["B"]), { full: true });
  await tick();
  await h.session.reconcile([]);
  await h.session.reconcile(createReviewProductItems(["B"]));
  old.resolve(product("B", "old-source"));
  await first;
  assert.equal(h.state.products[0].sourceId, "new-source");
  assert.deepEqual(h.calls, ["B", "B"]);
});

test("route replacement rejects old success and error even when the same Product is requested", async () => {
  for (const fail of [false, true]) {
    const old = deferred();
    let bCount = 0;
    const h = harness((name) =>
      name === "B" && ++bCount === 1 ? old.promise : Promise.resolve(product(name, "replacement"))
    );
    await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
    const add = h.session.reconcile(createReviewProductItems(["A", "B"]));
    await tick();
    await h.session.reconcile(createReviewProductItems(["B", "C"]), { full: true });
    const publications = h.snapshots.length;
    if (fail) old.reject(new Error("Stale failure"));
    else old.resolve(product("B", "old"));
    await add;
    assert.deepEqual(names(h), ["B", "C"]);
    assert.equal(h.state.products[0].sourceId, "replacement");
    assert.equal(h.snapshots.length, publications);
  }
});

test("rapid adds load B and C concurrently once, keeping authoritative order on reverse completion", async () => {
  const b = deferred();
  const c = deferred();
  const h = harness((name) => ({ B: b, C: c })[name]?.promise ?? Promise.resolve(product(name)));
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const a = h.state.products[0];
  const addB = h.session.reconcile(createReviewProductItems(["A", "B"]));
  const addC = h.session.reconcile(createReviewProductItems(["A", "B", "C"]));
  await tick();
  assert.deepEqual(h.calls, ["A", "B", "C"]);
  assert.equal(h.state.products[0], a);
  assert.equal(h.state.products[1].loadState, "loading");
  c.resolve(product("C"));
  await addC;
  assert.equal(h.state.loading, true);
  b.resolve(product("B"));
  await addB;
  assert.deepEqual(names(h), ["A", "B", "C"]);
  assert.equal(h.state.loading, false);
});

test("freshness overlapping add/remove retains survivors and cannot restore removed Products", async () => {
  const pending = deferred();
  let bCount = 0;
  const h = harness((name) =>
    name === "B" && ++bCount > 1 ? pending.promise : Promise.resolve(product(name))
  );
  await h.session.reconcile(createReviewProductItems(["A", "B"]), { full: true });
  const refresh = h.session.refresh(["B"]);
  await tick();
  await h.session.reconcile(createReviewProductItems(["A", "B", "C"]));
  await h.session.reconcile(createReviewProductItems(["A", "C"]));
  const publications = h.snapshots.length;
  pending.resolve(product("B"));
  assert.equal(await refresh, false);
  assert.equal(h.snapshots.length, publications);
  assert.deepEqual(h.calls, ["A", "B", "B", "C"]);
  assert.deepEqual(names(h), ["A", "C"]);
});

test("freshness overlapping addition publishes changed payload without dropping the new Product", async () => {
  const pending = deferred();
  let aCount = 0;
  const h = harness((name) =>
    name === "A" && ++aCount > 1 ? pending.promise : Promise.resolve(product(name))
  );
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const refresh = h.session.refresh(["A"]);
  await tick();
  await h.session.reconcile(createReviewProductItems(["A", "B"]));
  pending.resolve(product("A", "updated-source"));
  assert.equal(await refresh, true);
  assert.deepEqual(names(h), ["A", "B"]);
  assert.equal(h.state.products[0].sourceId, "updated-source");
  assert.deepEqual(h.calls, ["A", "A", "B"]);
});

test("freshness does not start a duplicate load already owned by the session", async () => {
  const pending = deferred();
  const h = harness(() => pending.promise);
  const load = h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  await tick();
  assert.equal(await h.session.refresh(["A"]), false);
  pending.resolve(product("A"));
  await load;
  assert.deepEqual(h.calls, ["A"]);
});

test("destroy and a superseding empty route suppress late loading, errors and content", async () => {
  for (const destroy of [true, false]) {
    const pending = deferred();
    const h = harness(() => pending.promise);
    const load = h.session.reconcile(createReviewProductItems(["A"]), { full: true });
    await tick();
    if (destroy) h.session.destroy();
    else await h.session.reconcile([], { full: true });
    const publications = h.snapshots.length;
    pending.reject(new Error("Late failure"));
    await load;
    assert.equal(h.snapshots.length, publications);
  }
});

test("source-aware identities never reuse another source payload and malformed results fail closed", async () => {
  const h = harness(async (name) => {
    const value = product(name, name === "A" ? "one" : "two");
    value.productContext.productKey = "shared-key";
    return value;
  });
  await h.session.reconcile(createReviewProductItems(["A", "B"]), { full: true });
  assert.deepEqual(
    h.state.products.map((p) => p.sourceId),
    ["one", "two"]
  );
  const malformed = harness(async () => product("Wrong"));
  await malformed.session.reconcile(createReviewProductItems(["A"]), { full: true });
  assert.equal(malformed.state.products[0].loadState, "failed");
});

test("real History loader resolves AOI, History and artifacts exactly once per sequential addition", async () => {
  const resolutionCalls = [];
  const historyCalls = [];
  const artifactCalls = [];
  const h = harness(async (name) => {
    const [result] = await loadReviewHistories([name], {
      workspaceProductService: {
        resolveProduct: async (datasetName) => {
          resolutionCalls.push(datasetName);
          return { status: "resolved", product: product(datasetName).productContext };
        },
      },
      fetchHistory: async (datasetName) => {
        historyCalls.push(datasetName);
        return { endpointAvailable: true, events: [] };
      },
      fetchArtifacts: async (datasetName) => {
        artifactCalls.push(datasetName);
        return [];
      },
    });
    return result;
  });
  for (const names of [["A"], ["A", "B"], ["A", "B", "C"]]) {
    await h.session.reconcile(createReviewProductItems(names), { full: names.length === 1 });
  }
  for (const calls of [h.calls, resolutionCalls, historyCalls, artifactCalls]) {
    assert.deepEqual(calls, ["A", "B", "C"]);
  }
});

test("real freshness monitor primes additions only and reloads changed B without A/C", async () => {
  let items = createReviewProductItems(["A"]);
  const revisions = { A: "1", B: "1", C: "1" };
  const revisionCalls = [];
  const calls = [];
  let state;
  const monitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => items.filter((i) => i.enabled).map((i) => i.datasetName),
    getRetainedDatasetNames: () => items.map((i) => i.datasetName),
    fetchFreshness: async (names) => {
      revisionCalls.push(names);
      return names.map((datasetName) => ({
        datasetName,
        available: true,
        revision: revisions[datasetName],
      }));
    },
    onChanged: (names) => session.refresh(names),
    documentRef: null,
  });
  const session = createReviewProductSession({
    prepare: (names, { full }) => (full ? monitor.prime(names) : monitor.primeAdditional(names)),
    loadProduct: async (name) => {
      calls.push(name);
      return product(name);
    },
    onChange: (next) => {
      state = next;
    },
  });
  await session.reconcile(items, { full: true });
  items = addReviewProductItem(items, "B");
  await session.reconcile(items);
  items = addReviewProductItem(items, "C");
  await session.reconcile(items);
  assert.deepEqual(revisionCalls, [["A"], ["B"], ["C"]]);
  revisions.B = "2";
  assert.equal(await monitor.check(), true);
  assert.deepEqual(calls, ["A", "B", "C", "B"]);
  assert.deepEqual(
    state.products.map((p) => p.datasetName),
    ["A", "B", "C"]
  );
  monitor.destroy();
  session.destroy();
});

test("multiple new Products in one composition start concurrently and keep requested order", async () => {
  const b = deferred();
  const c = deferred();
  const h = harness((name) => ({ B: b, C: c })[name]?.promise ?? Promise.resolve(product(name)));
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const add = h.session.reconcile(createReviewProductItems(["C", "A", "B"]));
  await tick();
  assert.deepEqual(h.calls, ["A", "C", "B"]);
  b.resolve(product("B"));
  c.resolve(product("C"));
  await add;
  assert.deepEqual(names(h), ["C", "A", "B"]);
});

test("replacement during preparation prevents old Product requests from starting", async () => {
  const pending = deferred();
  const calls = [];
  const snapshots = [];
  let prepareCount = 0;
  const session = createReviewProductSession({
    prepare: () => (++prepareCount === 1 ? pending.promise : Promise.resolve()),
    loadProduct: async (name) => {
      calls.push(name);
      return product(name);
    },
    onChange: (state) => snapshots.push(state),
  });
  const old = session.reconcile(createReviewProductItems(["A"]), { full: true });
  await session.reconcile(createReviewProductItems(["B"]), { full: true });
  const count = snapshots.length;
  pending.resolve();
  await old;
  assert.deepEqual(calls, ["B"]);
  assert.equal(snapshots.length, count);
});

test("rejected automatic loader retains successful content and declines revision acknowledgement", async () => {
  let rejectRefresh = false;
  const h = harness(async (name) => {
    if (rejectRefresh) throw new Error("Temporary loader failure");
    return product(name);
  });
  await h.session.reconcile(createReviewProductItems(["A"]), { full: true });
  const original = h.state.products[0];
  rejectRefresh = true;
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(await h.session.refresh(["A"]), false);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(h.state.products[0], original);
  rejectRefresh = false;
  assert.equal(await h.session.refresh(["A"]), true);
  assert.deepEqual(h.calls, ["A", "A", "A"]);
});
