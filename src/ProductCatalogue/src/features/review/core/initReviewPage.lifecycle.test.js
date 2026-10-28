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
} = {}) {
  const listeners = new Map();
  const windows = new Map();
  const calls = [];
  const renders = [];
  const routes = [];
  const primes = [];
  let monitorOptions;
  const context = {
    ...productList,
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
    fetchProductCatalog: async () => [],
    createWorkspaceFreshnessMonitor: (options) => {
      monitorOptions = options;
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
    onProductOperationStateChanged: () => () => {},
    loadReviewHistories: async (names) => {
      calls.push(...names);
      return Promise.all(names.map(load));
    },
    createReviewDocumentTitle: (names) => names.join(","),
    getCurrentReviewRoute: () => ({ datasetNames: ["D"] }),
    setReviewRouteUrl: (names, options) => routes.push({ names: [...names], options }),
    renderReviewPage: (state) => renders.push(state),
    captureReviewProductListInteraction: () => ({ type: "product-local" }),
    captureReviewWorkspaceContentInteraction: () => ({ type: "workspace-local" }),
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
  assert.equal(h.state.productListInteraction, null);
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
  assert.equal(h.state.productListInteraction, null);
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
