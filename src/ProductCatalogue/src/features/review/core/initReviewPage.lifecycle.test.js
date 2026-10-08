import {
  createReviewPackageFixture,
  packageNames,
  waitForReview,
} from "../testSupport/reviewPackageFixture.js";
import { loadReviewHistories as loadOwnedReviewHistories } from "../services/reviewHistoryLoader.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
import { resolveReviewComposition } from "../services/reviewWorkUnitResolver.js";
import { getReviewResolutionAliases } from "../domain/reviewWorkUnits.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as productList from "../domain/reviewProductList.js";
import { createReviewProductSession } from "./reviewProductSession.js";
import { validateProductCatalogSelection } from "../../products/domain/productCatalog.js";

// Evaluate the production coordinator with explicit browser/API boundaries, so
// event-to-loader behavior can be tested without ArcGIS or Calcite dependencies.
const source = (await readFile(new URL("initReviewPage.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
  .replace("export async function initReviewPage", "async function initReviewPage");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function harness({
  load = async (name) => result(name),
  initial = ["A"],
  beforeReady = async () => {},
  catalog = [],
  resolveWorkUnit = async (name) => ({
    status: "resolved",
    product: result(name).productContext,
    requestedDatasetName: name,
  }),
  fetchFreshness = null,
} = {}) {
  const listeners = new Map();
  const windows = new Map();
  const calls = [];
  const renders = [];
  const routes = [];
  const primes = [];
  let interactionCapture = 0;
  let monitorOptions;
  let operationListener;
  let monitor;
  const context = {
    ...productList,
    getReviewResolutionAliases,
    resolveReviewComposition: (items, options) =>
      resolveReviewComposition(items, {
        ...options,
        workspaceWorkUnitService: { resolveWorkUnit },
      }),
    createReviewProductSession,
    validateProductCatalogSelection,
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
    window: {
      addEventListener: (name, callback) => windows.set(name, callback),
      removeEventListener: (name) => windows.delete(name),
    },
    requestAnimationFrame: (callback) => callback(),
    loadStatuses: async () => {},
    hideLoader() {},
    noticeError() {},
    fetchProductCatalog: async () => catalog,
    createWorkspaceFreshnessMonitor: (options) => {
      monitorOptions = options;
      if (fetchFreshness) {
        monitor = createWorkspaceFreshnessMonitor({
          ...options,
          fetchFreshness,
          documentRef: null,
          setIntervalFn: null,
        });
        return monitor;
      }
      return {
        prime: async (names) => primes.push([...names]),
        primeAdditional: async (names) => primes.push([...names]),
        start() {},
        check() {},
        retain() {},
        destroy() {},
      };
    },
    getProductOperationState: () => ({ running: false }),
    onProductOperationStateChanged: (callback) => {
      operationListener = callback;
      return () => {};
    },
    loadReviewHistories: async (names, options) => {
      calls.push(...names);
      return Promise.all(names.map((name) => load(name, options)));
    },
    createReviewDocumentTitle: (names) => names.join(","),
    getCurrentReviewRoute: () => ({ datasetNames: ["D"] }),
    setReviewRouteUrl: (names, options) => routes.push({ names: [...names], options }),
    renderReviewPage: (state) => renders.push(state),
    captureReviewProductListInteraction: () => ({
      type: "product-local",
      capture: ++interactionCapture,
    }),
    captureReviewWorkspaceContentInteraction: () => ({
      type: "workspace-local",
      capture: ++interactionCapture,
    }),
  };
  const init = runInNewContext(`${source}\ninitReviewPage;`, context);
  const startup = init({ datasetNames: initial });
  await beforeReady({ listeners, windows });
  const page = await startup;
  return {
    page,
    calls,
    renders,
    routes,
    primes,
    windows,
    send: (name, detail) => listeners.get(`pc-review-${name}`)({ detail }),
    refreshChanged: (names) => monitorOptions.onChanged(names),
    notifyOperation: (datasetName) => operationListener({ datasetName }),
    checkFreshness: () => monitor?.check(),
    get state() {
      return renders.at(-1);
    },
  };
}

function result(datasetName) {
  return {
    datasetName,
    productContext: { datasetName, sourceId: "source", productKey: datasetName },
    loadState: "loaded",
    history: { events: [datasetName] },
  };
}

test("page events route adds, remove and visibility through one incremental owner", async () => {
  const h = await harness();
  await h.send("product-add", { datasetName: "B" });
  await h.send("product-add", { datasetName: "C" });
  await h.send("product-remove", { id: "B" });
  await h.send("product-toggle", { id: "A", enabled: false });
  await h.send("product-toggle", { id: "A", enabled: true });
  assert.deepEqual(h.calls, ["A", "B", "C"]);
  assert.deepEqual(h.primes, [["A"], ["B"], ["C"]]);
  assert.deepEqual(
    h.page.products.map((p) => p.datasetName),
    ["A", "C"]
  );
  assert.deepEqual(h.routes.at(-1).names, ["A", "C"]);
  h.page.destroy();
});

test("page manual Refresh remains full and FI-022 callback remains changed-only", async () => {
  const h = await harness({ initial: ["A", "B", "C"] });
  await h.refreshChanged(["B"]);
  assert.deepEqual(h.calls, ["A", "B", "C", "B"]);
  await h.send("refresh");
  assert.deepEqual(h.calls, ["A", "B", "C", "B", "A", "B", "C"]);
  assert.equal(h.routes.at(-1).options.replace, true);
  h.page.destroy();
});

test("page preserves FI-038 intent and selections while FI-041 snapshots remain call-local", async () => {
  const h = await harness();
  h.send("content-bulk-toggle", { contentType: "history", enabled: false });
  h.send("content-toggle", { id: "A", contentType: "history", enabled: true });
  assert.equal(h.state.productListInteraction.type, "product-local");
  await h.send("product-add", { datasetName: "B" });
  assert.deepEqual(
    h.state.productItems.map((p) => p.contentTypes.history),
    [true, false]
  );
  assert.equal(h.state.productListInteraction.type, "product-local");
  await h.send("refresh");
  assert.deepEqual(
    h.state.productItems.map((p) => p.contentTypes.history),
    [true, false]
  );
  await h.send("product-remove", { id: "A" });
  await h.send("product-add", { datasetName: "C" });
  assert.deepEqual(
    h.state.productItems.map((p) => p.contentTypes.history),
    [false, false]
  );
  await h.page.loadReviewDatasetNames(["D"]);
  assert.equal(h.state.productItems[0].contentTypes.history, true);
  assert.equal(h.state.productListInteraction.type, "product-local");
  await h.send("product-add", { datasetName: "E" });
  assert.equal(h.state.productItems[1].contentTypes.history, true);
  h.page.destroy();
});

test("page late addition cannot rewrite a replacement route or publish stale content", async () => {
  const pending = deferred();
  const started = deferred();
  const h = await harness({
    load: (name) => {
      if (name === "B") {
        started.resolve();
        return pending.promise;
      }
      return Promise.resolve(result(name));
    },
  });
  const add = h.send("product-add", { datasetName: "B" });
  await started.promise;
  await h.windows.get("popstate")();
  const count = h.renders.length;
  const routeCount = h.routes.length;
  pending.resolve(result("B"));
  await add;
  assert.equal(h.renders.length, count);
  assert.equal(h.routes.length, routeCount);
  assert.deepEqual(h.routes.at(-1).names, ["D"]);
  assert.deepEqual(
    h.page.products.map((p) => p.datasetName),
    ["D"]
  );
  h.page.destroy();
});

test("route replacement during initial loading owns the final composition", async () => {
  const started = deferred();
  const pending = deferred();
  const h = await harness({
    load: (name) => {
      if (name === "A") {
        started.resolve();
        return pending.promise;
      }
      return Promise.resolve(result(name));
    },
    beforeReady: async ({ windows }) => {
      await started.promise;
      await windows.get("popstate")();
      pending.resolve(result("A"));
    },
  });
  assert.deepEqual(h.calls, ["A", "D"]);
  assert.deepEqual(
    h.page.products.map((p) => p.datasetName),
    ["D"]
  );
  assert.deepEqual(h.routes.at(-1).names, ["D"]);
  h.page.destroy();
});

async function packagePage(options = {}) {
  const fixture = createReviewPackageFixture();
  const h = await harness({
    initial: [...packageNames, "Simple A"],
    catalog: packageNames
      .map((name) => ({ name, datasetName: name }))
      .concat([{ name: "Simple A", datasetName: "Simple A" }]),
    resolveWorkUnit: (name) => fixture.options.workspaceWorkUnitService.resolveWorkUnit(name),
    load: async (name, loaderOptions) => {
      const [product] = await loadOwnedReviewHistories([name], {
        ...fixture.options,
        ...loaderOptions,
      });
      return product;
    },
    ...options,
  });
  return {
    ...h,
    fixture,
    get state() {
      return h.state;
    },
  };
}

for (const initial of [packageNames, [...packageNames].reverse()]) {
  test(`page route/list canonicalize package alias order ${JSON.stringify(initial)}`, async () => {
    const h = await packagePage({ initial });
    assert.deepEqual(h.routes.at(-1).names, [packageNames[0]]);
    assert.equal(h.state.productItems.length, 1);
    assert.equal(h.page.products.length, 1);
    assert.equal(h.page.products[0].members.length, 2);
    h.page.destroy();
  });
}

test("S-57-only picker catalog does not reject its canonical representative on later edits", async () => {
  const h = await packagePage({
    initial: [packageNames[1]],
    catalog: [{ name: packageNames[1], datasetName: packageNames[1] }],
  });
  assert.deepEqual(h.routes.at(-1).names, [packageNames[0]]);
  await h.send("product-toggle", { id: packageNames[0].toUpperCase(), enabled: false });
  await h.send("product-toggle", { id: packageNames[0].toUpperCase(), enabled: true });
  assert.equal(h.state.productItems.length, 1);
  assert.equal(h.state.productItems[0].enabled, true);
  assert.equal(h.calls.length, 1);
  h.page.destroy();
});

test("package alias cannot re-add or reactivate an already selected disabled work unit", async () => {
  const h = await packagePage();
  const before = h.calls.length;
  await h.send("product-toggle", { id: packageNames[0].toUpperCase(), enabled: false });
  await h.send("product-add", { datasetName: packageNames[1] });
  assert.equal(h.state.productItems.length, 2);
  assert.equal(h.state.productItems[0].enabled, false);
  assert.ok(h.state.productCatalog.excludedProductNames.includes(packageNames[1].toUpperCase()));
  assert.equal(h.calls.length, before);
  h.page.destroy();
});

test("package composition preserves defaults, bulk intent, overrides and fresh interaction snapshots", async () => {
  const h = await packagePage();
  assert.ok(h.state.productItems.every((item) => Object.values(item.contentTypes).every(Boolean)));
  h.send("content-bulk-toggle", { contentType: "history", enabled: false });
  h.send("content-toggle", {
    id: packageNames[0].toUpperCase(),
    contentType: "history",
    enabled: true,
  });
  assert.equal(
    productList.getReviewContentTypeAggregateState(h.state.productItems, "history"),
    "mixed"
  );
  const before = h.calls.length;
  await h.send("product-add", { datasetName: packageNames[1] });
  assert.equal(h.calls.length, before);
  assert.deepEqual(
    h.state.productItems.map((item) => item.contentTypes.history),
    [true, false]
  );
  assert.equal(h.state.productListInteraction.type, "product-local");
  await h.send("refresh");
  assert.deepEqual(
    h.state.productItems.map((item) => item.contentTypes.history),
    [true, false]
  );
  await h.send("product-remove", { id: packageNames[0].toUpperCase() });
  await h.send("product-add", { datasetName: packageNames[1] });
  assert.equal(h.state.productItems[1].contentTypes.history, false);
  h.page.destroy();
});

test("related member operation notifications share one canonical freshness reload", async () => {
  let revision = "1";
  const observations = [];
  const gate = deferred();
  let wait = false;
  const h = await packagePage({
    fetchFreshness: async (names) => {
      observations.push([...names]);
      if (wait) await gate.promise;
      return names.map((datasetName) => ({
        datasetName,
        available: true,
        revision: datasetName === packageNames[0] ? revision : "1",
      }));
    },
  });
  wait = true;
  revision = "2";
  h.notifyOperation(packageNames[0]);
  h.notifyOperation(packageNames[1]);
  const check = h.checkFreshness();
  gate.resolve();
  assert.equal(await check, true);
  assert.deepEqual(h.calls, [packageNames[0], "Simple A", packageNames[0]]);
  assert.equal(observations.length, 2);
  assert.ok(observations.every((names) => !names.includes(packageNames[1])));
  h.page.destroy();
});

test("content edits during alias canonicalization retain current overrides and addition intent", async () => {
  const h = await packagePage({ initial: ["Simple A"] });
  const gate = deferred();
  h.fixture.controls.detailGate = gate;
  const add = h.send("product-add", { datasetName: packageNames[1] });
  await waitForReview(() => h.fixture.calls.detail.length > 0);
  h.send("content-bulk-toggle", { contentType: "history", enabled: false });
  h.send("content-toggle", { id: "SIMPLE A", contentType: "history", enabled: true });
  const capture = h.state.productListInteraction.capture;
  h.fixture.controls.detailGate = null;
  gate.resolve();
  await add;
  assert.deepEqual(
    h.state.productItems.map((item) => item.contentTypes.history),
    [true, false]
  );
  assert.ok(h.state.productListInteraction.capture > capture);
  assert.deepEqual(h.routes.at(-1).names, ["Simple A", packageNames[0]]);
  h.page.destroy();
});

test("late package alias proof cannot replace a newer page route or reset workspace intent", async () => {
  const h = await packagePage({ initial: ["Simple A"] });
  const gate = deferred();
  h.fixture.controls.detailGate = gate;
  const add = h.send("product-add", { datasetName: packageNames[1] });
  await waitForReview(() => h.fixture.calls.detail.length > 0);
  await h.page.loadReviewDatasetNames(["Simple A"]);
  h.send("content-bulk-toggle", { contentType: "history", enabled: false });
  const before = h.renders.length;
  gate.resolve();
  await add;
  assert.equal(h.renders.length, before);
  assert.deepEqual(h.routes.at(-1).names, ["Simple A"]);
  assert.equal(h.state.productItems[0].contentTypes.history, false);
  h.page.destroy();
});
