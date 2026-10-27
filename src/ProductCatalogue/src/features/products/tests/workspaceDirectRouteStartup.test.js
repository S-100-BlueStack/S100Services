import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as analyzeList from "../../analyze/domain/analyzeDatasetList.js";
import * as analyzeUnits from "../../analyze/domain/analyzeWorkUnits.js";
import * as reviewList from "../../review/domain/reviewProductList.js";
import {
  getReviewResolutionAliases,
  getReviewWorkUnitSignature,
} from "../../review/domain/reviewWorkUnits.js";
import { createReviewProductSession } from "../../review/core/reviewProductSession.js";
import { validateProductCatalogSelection } from "../domain/productCatalog.js";

// Exercise the real page coordinators with controlled browser and data boundaries.
// The Product session and list/identity-domain functions remain production code.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const product = (name) => ({
  datasetName: name,
  workspaceLoadState: "loaded",
  loadState: "loaded",
  productContext: { sourceId: "test-source", productKey: name, datasetName: name },
  history: { events: [] },
});

function packageFixture() {
  const members = [
    { key: "s101", sourceId: "s101", datasetName: "Primary" },
    { key: "s57", sourceId: "s57", datasetName: "Secondary" },
  ];
  const contexts = members.map((member) => ({
    sourceId: member.sourceId,
    productKey: member.datasetName,
    datasetName: member.datasetName,
    data: { attributes: { productSpecification: member.key.toUpperCase() } },
  }));
  const workUnit = {
    kind: "package",
    identityKey: "package:primary",
    primaryMemberKey: "s101",
    members,
  };
  const resolution = {
    status: "resolved",
    requestedDatasetName: "Secondary",
    product: contexts[0],
    memberProducts: contexts,
    workUnit,
  };
  const payload = {
    ...product("Primary"),
    productContext: contexts[0],
    workUnit,
    members: contexts.map((productContext) => ({ productContext })),
    workUnitSignature: getReviewWorkUnitSignature(resolution),
  };
  return { resolution, payload };
}

async function createHarness(
  route,
  { initial = ["A"], catalog = deferred(), loadGate, packageRoute = false } = {}
) {
  const file =
    route === "Analyze"
      ? new URL("../../analyze/core/initAnalyzePage.js", import.meta.url)
      : new URL("../../review/core/initReviewPage.js", import.meta.url);
  const source = (await readFile(file, "utf8"))
    .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
    .replace(`export async function init${route}Page`, `async function init${route}Page`);
  const events = new Map();
  const windowEvents = new Map();
  const state = { renders: [], loads: [], routes: [], warnings: [], starts: 0, teardown: 0 };
  let routeNames = initial;
  const packageData = packageRoute ? packageFixture() : null;
  const monitor = {
    prime: async () => {},
    primeAdditional: async () => {},
    retain() {},
    start() {
      state.starts++;
    },
    destroy() {
      state.teardown++;
    },
    check: async () => {},
  };
  const document = {
    body: { classList: { add() {}, remove() {} } },
    title: "",
    getElementById: () => null,
    addEventListener: (event, handler) => events.set(event, handler),
    removeEventListener: (event) => events.delete(event),
  };
  const window = {
    innerWidth: 1200,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    addEventListener: (event, handler) => windowEvents.set(event, handler),
    removeEventListener: (event) => windowEvents.delete(event),
  };
  const common = {
    console,
    document,
    window,
    requestAnimationFrame: (callback) => callback(),
    getProductOperationState: () => ({ running: false }),
    onProductOperationStateChanged: () => () => {},
    createWorkspaceFreshnessMonitor: () => monitor,
    validateProductCatalogSelection,
    fetchProductCatalog: () => catalog.promise,
    loadStatuses: async () => {},
    hideLoader() {},
    noticeError: (...args) => state.warnings.push(args),
    noticeWarning: (...args) => state.warnings.push(args),
  };
  let init;
  if (route === "Analyze") {
    const map = { add() {}, remove() {} };
    const view = { when: async () => {}, whenLayerView: async () => {}, popup: { close() {} } };
    init = runInNewContext(`${source}\ninitAnalyzePage;`, {
      ...common,
      ...analyzeList,
      ...analyzeUnits,
      createMap: () => map,
      createView: () => view,
      createHoverManager: () => ({
        clear() {},
        registerLayer: async () => {},
        unregisterLayer() {},
      }),
      registerPopupHoverSync: () => () => {},
      createLoaderProgressSession: () =>
        Object.fromEntries(
          [
            "startLoading",
            "markDataReceived",
            "startRendering",
            "handleRenderProgress",
            "complete",
            "fail",
            "cleanup",
          ].map((key) => [key, () => {}])
        ),
      resolveAnalyzeWorkUnits: async (names) =>
        names.map((name) =>
          packageData && ["Primary", "Secondary"].includes(name)
            ? { ...packageData.resolution, requestedDatasetName: name }
            : {
                status: "resolved",
                requestedDatasetName: name,
                product: product(name).productContext,
                workUnit: null,
              }
        ),
      fetchAnalyzeProducts: async (names) => {
        state.loads.push([...names]);
        if (loadGate) await loadGate.promise;
        return names.map((name) =>
          packageData && name === "Primary" ? packageData.payload : product(name)
        );
      },
      loadAnalyzeProductHistories: async (products) => products,
      createAnalyzeLayers: async () => [],
      zoomToGraphicsExtent: async () => true,
      getCurrentRoute: () => ({ datasetNames: routeNames }),
      createAnalyzeDocumentTitle: (names) => names.join(","),
      setAnalyzeRouteUrl: (names) => state.routes.push([...names]),
      renderAnalyzeSidebar: (snapshot) => state.renders.push(snapshot),
    });
  } else {
    init = runInNewContext(`${source}\ninitReviewPage;`, {
      ...common,
      ...reviewList,
      getReviewResolutionAliases,
      createReviewProductSession,
      resolveReviewComposition: async (items) => ({
        items: items.map((item) =>
          packageData && ["Primary", "Secondary"].includes(item.datasetName)
            ? { ...item, datasetName: "Primary", id: "PRIMARY" }
            : item
        ),
        resolutions: items.map((item) =>
          packageData && ["Primary", "Secondary"].includes(item.datasetName)
            ? { ...packageData.resolution, requestedDatasetName: item.datasetName }
            : {
                status: "resolved",
                requestedDatasetName: item.datasetName,
                product: product(item.datasetName).productContext,
                workUnit: null,
              }
        ),
      }),
      loadReviewHistories: async (names) => {
        state.loads.push([...names]);
        if (loadGate) await loadGate.promise;
        return names.map((name) =>
          packageData && name === "Primary" ? packageData.payload : product(name)
        );
      },
      createReviewDocumentTitle: (names) => names.join(","),
      getCurrentReviewRoute: () => ({ datasetNames: routeNames }),
      setReviewRouteUrl: (names) => state.routes.push([...names]),
      renderReviewPage: (snapshot) => state.renders.push(snapshot),
      captureReviewProductListInteraction: () => ({ scrollTop: 42 }),
      captureReviewWorkspaceContentInteraction: () => ({ focus: "history" }),
    });
  }
  const startup = init({ datasetNames: initial });
  return {
    catalog,
    startup,
    state,
    document,
    setRoute(names) {
      routeNames = names;
    },
    async goBack() {
      return windowEvents.get("popstate")();
    },
    send(name, detail) {
      const prefix = route === "Analyze" ? "pc-analyze-dataset-" : "pc-review-product-";
      return events.get(`${prefix}${name}`)({ detail });
    },
  };
}

async function startWithoutCatalog(route, options = {}) {
  const h = await createHarness(route, options);
  // The promise must resolve while the catalog gate is still pending.
  let timeoutId;
  const settled = await Promise.race([
    h.startup.then((page) => ({ page })),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timeout: true }), 300);
    }),
  ]);
  clearTimeout(timeoutId);
  if (settled.timeout) {
    h.catalog.resolve([]); // Never strand the baseline's old sequential startup.
    await h.startup;
    assert.fail(`${route} initial route blocked on the picker catalogue`);
  }
  return { ...h, page: settled.page };
}

for (const route of ["Analyze", "Review"]) {
  test(`${route}: direct Product loads while picker catalogue is pending`, async () => {
    const h = await startWithoutCatalog(route);
    try {
      assert.deepEqual(
        h.state.loads.map((names) => [...names]),
        [["A"]]
      );
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A"]
      );
      assert.equal(h.state.renders.at(-1).productCatalog.loading, true);
      assert.equal(h.state.starts, 1);
      h.catalog.resolve([]);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A"]
      );
      assert.equal(h.state.renders.at(-1).productCatalog.loading, false);
    } finally {
      h.page.destroy();
    }
  });

  test(`${route}: catalogue rejection leaves direct Product intact`, async () => {
    const h = await startWithoutCatalog(route);
    try {
      h.catalog.reject(new Error("Picker unavailable"));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A"]
      );
      assert.ok(h.state.renders.at(-1).productCatalog.error);
    } finally {
      h.page.destroy();
    }
  });

  test(`${route}: newer route wins over a late picker response`, async () => {
    const h = await startWithoutCatalog(route);
    try {
      h.setRoute(["B"]);
      await h.goBack();
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["B"]
      );
      h.catalog.resolve(["A"]); // A partial/stale picker list lacks B.
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["B"]
      );
      await h.goBack();
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["B"]
      );
    } finally {
      h.page.destroy();
    }
  });

  test(`${route}: picker addition is blocked during pending catalogue and validated when ready`, async () => {
    const h = await startWithoutCatalog(route);
    try {
      await h.send("add", { datasetNames: ["Unsupported"] });
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A"]
      );
      h.catalog.resolve(["A", "B"]);
      await new Promise((resolve) => setImmediate(resolve));
      await h.send("add", { datasetNames: ["Unsupported"] });
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A"]
      );
      await h.send("add", { datasetNames: ["B"] });
      assert.deepEqual(
        h.page.products.map((entry) => entry.datasetName),
        ["A", "B"]
      );
    } finally {
      h.page.destroy();
    }
  });

  test(`${route}: late picker completion after destroy does not render`, async () => {
    const h = await startWithoutCatalog(route);
    h.page.destroy();
    const count = h.state.renders.length;
    h.catalog.resolve(["B"]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.state.renders.length, count);
  });
}

for (const route of ["Analyze", "Review"]) {
  test(`${route}: a package member route resolves its canonical Product with a pending picker`, async () => {
    const h = await startWithoutCatalog(route, { initial: ["Secondary"], packageRoute: true });
    try {
      assert.deepEqual(
        h.page.products.map((value) => value.datasetName),
        ["Primary"]
      );
      h.catalog.resolve(["Secondary"]);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(
        h.page.products.map((value) => value.datasetName),
        ["Primary"]
      );
      await h.goBack();
      assert.deepEqual(
        h.page.products.map((value) => value.datasetName),
        ["Primary"]
      );
    } finally {
      h.page.destroy();
    }
  });

  test(`${route}: late picker response cannot hide workspace loading`, async () => {
    const catalog = deferred();
    const loadGate = deferred();
    const h = await createHarness(route, { catalog, loadGate });
    try {
      for (let attempt = 0; attempt < 30 && h.state.loads.length === 0; attempt++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(
        h.state.loads.length,
        1,
        "The Product request started before the picker settled"
      );
      catalog.resolve(["A"]);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(h.state.renders.at(-1).loading, true);
      loadGate.resolve();
      const page = await h.startup;
      assert.deepEqual(
        page.products.map((value) => value.datasetName),
        ["A"]
      );
      assert.equal(h.state.renders.at(-1).loading, false);
      page.destroy();
    } finally {
      catalog.resolve(["A"]);
      loadGate.resolve();
    }
  });
}

test("Analyze: late catalogue update restores a focused Product-list toggle", async () => {
  const h = await startWithoutCatalog("Analyze");
  const control = { getAttribute: () => "Enable A" };
  let restored = false;
  const replacement = {
    getAttribute: () => "Enable A",
    focus({ preventScroll }) {
      restored = preventScroll;
    },
  };
  h.document.activeElement = control;
  h.document.getElementById = () => ({
    querySelector: () => ({ contains: (element) => element === control }),
    querySelectorAll: () => [replacement],
  });
  try {
    h.catalog.resolve(["A"]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(restored, true);
  } finally {
    h.page.destroy();
  }
});
