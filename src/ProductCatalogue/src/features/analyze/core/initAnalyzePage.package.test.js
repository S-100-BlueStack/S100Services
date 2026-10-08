import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as datasets from "../domain/analyzeDatasetList.js";
import * as workUnits from "../domain/analyzeWorkUnits.js";
import { validateProductCatalogSelection } from "../../products/domain/productCatalog.js";
import { createWorkspaceProductContext } from "../../products/domain/productContext.js";
import { loadAnalyzeProductHistories } from "../services/analyzeHistoryLoader.js";
import { loadAnalyzeMapTestPipeline } from "../map/analyzeMapTestSupport.js";
import {
  getCorrectionSymbol,
  getMixedCorrectionSymbol,
} from "../../map/symbology/correctionSymbols.js";
import { fetchAnalyzeProducts as fetchOwnedAnalyzeProducts } from "../api/analyzeApi.js";
import { artifactHarness, validationArtifact } from "../api/analyzeArtifactTestSupport.js";

const names = ["Primary harbour", "Mapped legacy"];
const declaration = {
  kind: "package",
  primaryMemberKey: "s101",
  identityKey: "package-harbour",
  members: names.map((datasetName, index) => ({
    datasetName,
    key: index ? "s57" : "s101",
    sourceId: index ? "s57" : "s101",
    label: index ? "S-57" : "S-101",
  })),
};
const geometry = { x: 10, y: 56 };
const ordinaryName = "Ordinary chart";
function simpleProduct(edition = 1) {
  return {
    datasetName: ordinaryName,
    edition,
    workspaceLoadState: "loaded",
    productContext: createWorkspaceProductContext({
      sourceId: "ordinary-test",
      datasetName: ordinaryName,
      productKey: ordinaryName,
      productType: "simple-product",
      capabilities: { analyze: true, history: true },
    }),
    aoiGeometry: { x: 20, y: 57 },
  };
}
function packageProduct(edition = 1, statuses = [8, 11], polygonGeometry = false) {
  const members = declaration.members.map((member) => ({
    datasetName: member.datasetName,
    edition,
    status: statuses[declaration.members.indexOf(member)],
    memberKey: member.key,
    memberLabel: member.label,
    workspaceLoadState: "loaded",
    productContext: createWorkspaceProductContext({
      sourceId: member.sourceId,
      datasetName: member.datasetName,
      productKey: member.datasetName,
      productType: "electronic-product",
      capabilities: { analyze: true, history: true },
    }),
  }));
  return {
    ...members[0],
    aoiGeometry: polygonGeometry
      ? {
          rings: [
            [
              [10, 56],
              [11, 56],
              [11, 57],
              [10, 56],
            ],
          ],
          spatialReference: { wkid: 4326 },
        }
      : { ...geometry, x: 10 + edition },
    workUnit: declaration,
    members,
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function harness(
  t,
  initial = names,
  { memberStatuses = [8, 11], polygonGeometry = false, fetchProducts = null } = {}
) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const events = new Map();
  globalThis.document = {
    body: { classList: { add() {} } },
    getElementById: () => null,
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: (name) => events.delete(name),
  };
  globalThis.window = {
    innerWidth: 1400,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
  };
  const state = {
    memberStatuses,
    polygonGeometry,
    revision: 1,
    loads: 0,
    resolutions: 0,
    monitors: 0,
    route: [],
    snapshots: [],
    historyGate: null,
    layerGate: null,
    fail: false,
    failSimple: false,
    primeNames: [],
    removed: [],
    unregistered: [],
    registered: new Set(),
    closes: 0,
    failRegister: false,
    registrationGate: null,
  };
  const map = {
    layers: [],
    add(layer) {
      this.layers.push(layer);
    },
    async createLayer(definition, target = this) {
      const layer = {
        appSymbolization: definition.symbolization ?? null,
        graphics: pipeline.esriJsonToGraphics(definition.data, {
          layerId: definition.id,
          symbolization: definition.symbolization,
        }),
      };
      layer.graphics.forEach((graphic) => {
        graphic.layer = layer;
      });
      target.add(layer);
      const gate = state.layerGate;
      if (gate) {
        state.layerGate = null;
        gate.started.resolve();
        await gate.done.promise;
        if (gate.reject) throw new Error("Layer construction failed");
      }
      return layer;
    },
    remove(layer) {
      state.removed.push(layer);
      this.layers = this.layers.filter((item) => item !== layer);
    },
  };
  const pipeline = await loadAnalyzeMapTestPipeline((target, definition) =>
    map.createLayer(definition, target)
  );
  const createLayers = pipeline.createAnalyzeLayers;
  const noop = () => {};
  const view = {
    when: async () => {},
    whenLayerView: async () => {},
    popup: {
      selectedFeature: null,
      visible: false,
      close() {
        state.closes++;
        this.visible = false;
      },
    },
  };
  const monitor = {
    start: noop,
    destroy: noop,
    check: noop,
    prime: async (names) => state.primeNames.push(names),
  };
  const dependencies = {
    ...datasets,
    ...workUnits,
    validateProductCatalogSelection,
    createMap: () => map,
    createView: () => view,
    createHoverManager: () => ({
      clear: () => state.registered.clear(),
      registerLayer: async (layer) => {
        state.registered.add(layer);
        const gate = state.registrationGate;
        if (gate) {
          state.registrationGate = null;
          gate.started.resolve();
          await gate.done.promise;
        }
        if (state.failRegister) {
          state.failRegister = false;
          throw new Error("Layer view unavailable");
        }
      },
      unregisterLayer: (layer) => {
        state.unregistered.push(layer);
        state.registered.delete(layer);
      },
    }),
    registerPopupHoverSync: () => noop,
    noticeError: noop,
    noticeWarning: noop,
    fetchProductCatalog: async () => [...names, ordinaryName, "Broken"],
    loadStatuses: async () => {},
    createWorkspaceFreshnessMonitor: (options) => {
      state.monitors++;
      state.refresh = options.onChanged;
      return monitor;
    },
    onProductOperationStateChanged: () => noop,
    getProductOperationState: () => ({ running: false }),
    hideLoader: noop,
    createLoaderProgressSession: () => ({
      startLoading: noop,
      markDataReceived: noop,
      startRendering: noop,
      handleRenderProgress: noop,
      complete: noop,
      fail: noop,
      cleanup: noop,
    }),
    resolveAnalyzeWorkUnits: async (requested) => {
      state.resolutions++;
      const result = [];
      if (requested.some((name) => names.includes(name)))
        result.push({ product: packageProduct().productContext, workUnit: declaration });
      if (requested.includes(ordinaryName))
        result.push({ product: simpleProduct().productContext, workUnit: null });
      if (requested.includes("Broken"))
        result.push({ requestedDatasetName: "Broken", product: null, workUnit: null });
      return result;
    },
    fetchAnalyzeProducts: async (requested, options) => {
      state.loads++;
      if (options) assert.ok(options.resolutions, "Composition must reuse canonical resolution");
      if (fetchProducts) return fetchProducts(requested);
      return requested.map((name) =>
        name === ordinaryName
          ? state.failSimple
            ? {
                datasetName: ordinaryName,
                workspaceLoadState: "failed",
                loadError: "Simple unavailable",
              }
            : simpleProduct(state.revision)
          : name === "Broken"
            ? { datasetName: name, workspaceLoadState: "failed", loadError: "Provider failed" }
            : state.fail
              ? {
                  datasetName: names[0],
                  workspaceLoadState: "failed",
                  loadError: "Member unavailable",
                }
              : packageProduct(state.revision, state.memberStatuses, state.polygonGeometry)
      );
    },
    loadAnalyzeProductHistories: async (products) => {
      const gate = state.historyGate;
      state.historyGate = null;
      return loadAnalyzeProductHistories(products, {
        fetchHistory: async (name) => {
          if (name === names[1] && gate) {
            gate.started.resolve();
            await gate.done.promise;
          }
          return { endpointAvailable: true, events: [] };
        },
      });
    },
    createAnalyzeLayers: createLayers,
    zoomToGraphicsExtent: async () => true,
    createAnalyzeDocumentTitle: (values) => values.join(", "),
    getCurrentRoute: () => ({ datasetNames: initial }),
    setAnalyzeRouteUrl: (values) => {
      state.route = values;
    },
    renderAnalyzeSidebar: (snapshot) => state.snapshots.push(snapshot),
  };
  // Replace imports only, retaining the production initializer and generation logic.
  // The public factory uses production attribute transformation and F2 symbol selection.
  const source = await readFile(new URL("./initAnalyzePage.js", import.meta.url), "utf8");
  const token = `__analyzePackageTest${Math.random().toString(36).slice(2)}`;
  globalThis[token] = dependencies;
  const isolated = source.replace(
    /import\s+([\s\S]*?)\s+from\s+"[^"]+";/g,
    (_, bindings) => `const ${bindings} = globalThis[${JSON.stringify(token)}];`
  );
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`
  );
  const page = await module.initAnalyzePage({ datasetNames: initial });
  t.after(() => {
    page.destroy();
    delete globalThis[token];
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  });
  return { page, state, map, view, event: (name, detail) => events.get(name)({ detail }) };
}

test("startup and mapped-member add own one canonical item, one graphic, and one monitor", async (t) => {
  const h = await harness(t);
  assert.deepEqual(h.state.route, [names[0]]);
  assert.equal(h.page.products.length, 1);
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
  assert.deepEqual(h.state.primeNames, [[names[0]]]);
  await h.event("pc-analyze-dataset-add", { datasetNames: [names[1]] });
  assert.equal(h.page.products.length, 1);
  assert.deepEqual(h.state.route, [names[0]]);
  assert.equal(h.state.monitors, 1);
  assert.equal(h.state.loads, 2);
  await h.event("pc-analyze-dataset-toggle", { id: names[0].toLowerCase(), enabled: false });
  assert.equal(h.map.layers.length, 0);
  await h.event("pc-analyze-dataset-toggle", { id: names[0].toLowerCase(), enabled: true });
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
  await h.event("pc-analyze-dataset-remove", { id: names[0].toLowerCase() });
  assert.equal(h.page.products.length, 0);
  assert.equal(h.map.layers.length, 0);
});

test("one changed canonical revision reloads both members atomically and retains accepted state on failure", async (t) => {
  const h = await harness(t, [names[1]]);
  h.state.revision = 2;
  assert.equal(await h.state.refresh([names[0]]), true);
  assert.equal(h.state.loads, 2);
  assert.deepEqual(
    h.page.products[0].members.map((member) => member.edition),
    [2, 2]
  );
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
  const accepted = h.page.products[0].members;
  h.state.fail = true;
  assert.equal(await h.state.refresh([names[0]]), false);
  assert.equal(h.page.products[0].members, accepted);
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
});

test("late old member history cannot overwrite a newer composition or create orphan graphics", async (t) => {
  const h = await harness(t);
  const gate = { started: deferred(), done: deferred() };
  h.state.historyGate = gate;
  h.state.revision = 2;
  const oldRefresh = h.state.refresh([names[0]]);
  await gate.started.promise;
  h.state.revision = 3;
  await h.page.loadAnalyzeDatasetNames(names);
  gate.done.resolve();
  assert.equal(await oldRefresh, false);
  assert.deepEqual(
    h.page.products[0].members.map((member) => member.edition),
    [3, 3]
  );
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
});

test("failed add keeps an unrelated accepted package", async (t) => {
  const h = await harness(t);
  await h.event("pc-analyze-dataset-add", { datasetNames: ["Broken"] });
  assert.equal(h.page.products.length, 2);
  assert.equal(h.page.products[0].members.length, 2);
  assert.equal(h.page.products[1].workspaceLoadState, "failed");
  assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
});

function findGraphic(h, name) {
  return h.map.layers
    .flatMap((layer) => layer.graphics)
    .find((graphic) => graphic.attributes.datasetName === name);
}

for (const failSimple of [true, false]) {
  test(`package refresh preserves unrelated simple Graphic and popup (simple failure: ${failSimple})`, async (t) => {
    const h = await harness(t, [names[0], ordinaryName]);
    const original = findGraphic(h, ordinaryName);
    const packageGraphic = findGraphic(h, names[0]);
    h.view.popup.selectedFeature = original;
    h.view.popup.visible = true;
    const closes = h.state.closes;
    h.state.revision = 2;
    h.state.failSimple = failSimple;
    const result = await h.state.refresh(failSimple ? [names[0], ordinaryName] : [names[0]]);
    assert.equal(result, !failSimple);
    assert.equal(findGraphic(h, ordinaryName), original);
    assert.ok(h.map.layers.includes(original.layer));
    assert.equal(h.state.removed.includes(original.layer), false);
    assert.equal(h.state.unregistered.includes(original.layer), false);
    assert.equal(h.view.popup.selectedFeature, original);
    assert.equal(h.view.popup.visible, true);
    assert.equal(h.state.closes, closes);
    assert.notEqual(findGraphic(h, names[0]), packageGraphic);
    assert.equal(findGraphic(h, names[0]).geometry.x, 12);
    assert.deepEqual(
      h.page.products[0].members.map((member) => member.edition),
      [2, 2]
    );
    assert.equal(h.page.products[1].workspaceLoadState, failSimple ? "failed" : "loaded");
  });
}

test("failed package refresh preserves its accepted Graphic and unrelated simple popup", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const packageGraphic = findGraphic(h, names[0]);
  const simpleGraphic = findGraphic(h, ordinaryName);
  h.view.popup.selectedFeature = simpleGraphic;
  h.view.popup.visible = true;
  const closes = h.state.closes;
  h.state.fail = true;
  assert.equal(await h.state.refresh([names[0]]), false);
  assert.equal(findGraphic(h, names[0]), packageGraphic);
  assert.equal(findGraphic(h, ordinaryName), simpleGraphic);
  assert.equal(h.state.closes, closes);
  assert.equal(h.view.popup.visible, true);
});

for (const failSimple of [false, true]) {
  test(`simple-only refresh keeps its baseline map lifecycle (failure: ${failSimple})`, async (t) => {
    const h = await harness(t, [ordinaryName]);
    const original = findGraphic(h, ordinaryName);
    const closes = h.state.closes;
    h.state.revision = 2;
    h.state.failSimple = failSimple;
    assert.equal(await h.state.refresh([ordinaryName]), !failSimple);
    assert.equal(findGraphic(h, ordinaryName), original);
    assert.equal(h.state.removed.includes(original.layer), false);
    assert.equal(h.state.unregistered.includes(original.layer), false);
    assert.equal(h.state.closes, closes);
    assert.equal(h.page.products[0].workspaceLoadState, failSimple ? "failed" : "loaded");
  });
}

test("stale package layers are discarded before a blocked refresh resumes", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const originalSimple = findGraphic(h, ordinaryName);
  const gate = { started: deferred(), done: deferred() };
  h.state.layerGate = gate;
  h.state.revision = 2;
  const oldRefresh = h.state.refresh([names[0]]);
  await gate.started.promise;
  let currentSimple;
  try {
    await h.page.loadAnalyzeDatasetNames([ordinaryName]);
    currentSimple = findGraphic(h, ordinaryName);
    assert.ok(currentSimple);
    assert.notEqual(currentSimple, originalSimple);
    assert.equal(currentSimple.attributes.edition, 2);
    assert.ok(h.page.layers.includes(currentSimple.layer));
    assert.equal(
      findGraphic(h, names[0]),
      undefined,
      "Superseded staging must be absent before releasing layer creation"
    );
    assert.deepEqual([...h.state.registered], [currentSimple.layer]);
    assert.equal(h.view.popup.visible, false);
  } finally {
    gate.done.resolve();
    assert.equal(await oldRefresh, false);
  }
  assert.equal(findGraphic(h, ordinaryName), currentSimple);
  assert.equal(findGraphic(h, names[0]), undefined);
  assert.equal(h.map.layers.length, 1);
});

test("a newer targeted refresh owns the package while earlier creation is blocked", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const ordinary = findGraphic(h, ordinaryName);
  h.view.popup.selectedFeature = ordinary;
  h.view.popup.visible = true;
  const closes = h.state.closes;
  const gate = { started: deferred(), done: deferred() };
  h.state.layerGate = gate;
  h.state.revision = 2;
  const earlier = h.state.refresh([names[0]]);
  await gate.started.promise;
  let accepted;
  try {
    h.state.revision = 3;
    assert.equal(await h.state.refresh([names[0]]), true);
    accepted = findGraphic(h, names[0]);
    assert.equal(accepted.geometry.x, 13);
    assert.equal(
      h.map.layers.length,
      2,
      "Only the accepted package and ordinary layer may remain before releasing earlier creation"
    );
    assert.deepEqual(new Set(h.state.registered), new Set([ordinary.layer, accepted.layer]));
    assert.equal(findGraphic(h, ordinaryName), ordinary);
    assert.equal(h.state.closes, closes);
    assert.equal(h.view.popup.visible, true);
  } finally {
    gate.done.resolve();
    assert.equal(await earlier, false);
  }
  assert.equal(findGraphic(h, names[0]), accepted);
  assert.equal(findGraphic(h, ordinaryName), ordinary);
  assert.equal(h.map.layers.length, 2);
  assert.equal(h.state.unregistered.includes(accepted.layer), false);
});

for (const boundary of ["layerGate", "registrationGate"]) {
  test(`destroy removes package staging before blocked ${boundary} resumes`, async (t) => {
    const h = await harness(t, [names[0], ordinaryName]);
    const gate = { started: deferred(), done: deferred() };
    h.state[boundary] = gate;
    h.state.revision = 2;
    const refresh = h.state.refresh([names[0]]);
    await gate.started.promise;
    try {
      h.page.destroy();
      assert.equal(
        h.map.layers.length,
        0,
        "Destroy must remove staging without awaiting the refresh"
      );
      assert.equal(h.state.registered.size, 0);
    } finally {
      gate.done.resolve();
      assert.equal(await refresh, false);
    }
    assert.equal(h.map.layers.length, 0);
    assert.equal(h.state.registered.size, 0);
  });
}

for (const superseding of ["composition", "targeted"]) {
  test(`pending hover registration is cancelled by a newer ${superseding}`, async (t) => {
    const h = await harness(t, [names[0], ordinaryName]);
    const ordinary = findGraphic(h, ordinaryName);
    const gate = { started: deferred(), done: deferred() };
    h.state.registrationGate = gate;
    h.state.revision = 2;
    const earlier = h.state.refresh([names[0]]);
    await gate.started.promise;
    const stale = h.map.layers.find((layer) => !h.page.layers.includes(layer));
    assert.ok(stale);
    let authoritative;
    try {
      h.state.revision = 3;
      if (superseding === "composition") await h.page.loadAnalyzeDatasetNames([ordinaryName]);
      else assert.equal(await h.state.refresh([names[0]]), true);
      authoritative = [...h.map.layers];
      assert.equal(h.map.layers.includes(stale), false);
      assert.equal(h.state.registered.has(stale), false);
      if (superseding === "targeted") {
        assert.equal(findGraphic(h, ordinaryName), ordinary);
        assert.equal(h.state.unregistered.includes(ordinary.layer), false);
      }
    } finally {
      gate.done.resolve();
      assert.equal(await earlier, false);
    }
    assert.deepEqual(h.map.layers, authoritative);
    assert.equal(h.state.registered.has(stale), false);
  });
}

test("successful package replacement closes only the popup owned by that replaced package layer", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  h.view.popup.selectedFeature = findGraphic(h, names[0]);
  h.view.popup.visible = true;
  const closes = h.state.closes;
  h.state.revision = 2;
  assert.equal(await h.state.refresh([names[0]]), true);
  assert.equal(h.state.closes, closes + 1);
  assert.equal(h.view.popup.visible, false);
});

test("package layer registration failure discards only the unaccepted replacement layers", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  t.after(() => {
    console.warn = previousWarn;
  });
  const accepted = [...h.map.layers];
  const acceptedMembers = h.page.products[0].members;
  h.state.failRegister = true;
  h.state.revision = 2;
  assert.equal(await h.state.refresh([names[0]]), false);
  assert.deepEqual(h.map.layers, accepted);
  assert.equal(h.page.products[0].members, acceptedMembers);
  assert.ok(accepted.every((layer) => !h.state.unregistered.includes(layer)));
  assert.deepEqual(warnings, ["[Analyze] Automatic workspace refresh failed"]);
});

test("off-map creation preserves the accepted package popup and cleans rejected staging only", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const accepted = [...h.map.layers];
  const graphic = findGraphic(h, names[0]);
  const members = h.page.products[0].members;
  h.view.popup.selectedFeature = graphic;
  h.view.popup.visible = true;
  const closes = h.state.closes;
  const gate = { started: deferred(), done: deferred(), reject: true };
  h.state.layerGate = gate;
  h.state.revision = 2;
  const previousWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = previousWarn;
  });
  const refresh = h.state.refresh([names[0]]);
  await gate.started.promise;
  try {
    assert.deepEqual(h.map.layers, accepted);
    assert.deepEqual(new Set(h.state.registered), new Set(accepted));
    assert.equal(findGraphic(h, names[0]), graphic);
    assert.equal(h.view.popup.visible, true);
    assert.equal(h.state.closes, closes);
  } finally {
    gate.done.resolve();
    assert.equal(await refresh, false);
  }
  assert.deepEqual(h.map.layers, accepted);
  assert.equal(h.page.products[0].members, members);
  assert.deepEqual(new Set(h.state.registered), new Set(accepted));
  assert.ok(accepted.every((layer) => !h.state.unregistered.includes(layer)));
  assert.equal(h.view.popup.selectedFeature, graphic);
  assert.equal(h.view.popup.visible, true);
  assert.equal(h.state.closes, closes);
});

test("cancelling staged hover preserves the accepted package popup during a simple refresh", async (t) => {
  const h = await harness(t, [names[0], ordinaryName]);
  const accepted = [...h.map.layers];
  const graphic = findGraphic(h, names[0]);
  h.view.popup.selectedFeature = graphic;
  h.view.popup.visible = true;
  const closes = h.state.closes;
  const gate = { started: deferred(), done: deferred() };
  h.state.registrationGate = gate;
  h.state.revision = 2;
  const earlier = h.state.refresh([names[0]]);
  await gate.started.promise;
  try {
    assert.equal(await h.state.refresh([ordinaryName]), true);
    assert.deepEqual(h.map.layers, accepted);
    assert.deepEqual(new Set(h.state.registered), new Set(accepted));
    assert.ok(accepted.every((layer) => !h.state.unregistered.includes(layer)));
    assert.equal(h.view.popup.selectedFeature, graphic);
    assert.equal(h.view.popup.visible, true);
    assert.equal(h.state.closes, closes);
  } finally {
    gate.done.resolve();
    assert.equal(await earlier, false);
  }
  assert.deepEqual(h.map.layers, accepted);
  assert.deepEqual(new Set(h.state.registered), new Set(accepted));
  assert.equal(h.state.closes, closes);
});

test("package refresh transitions scalar to mixed and back without touching ordinary map state", async (t) => {
  const h = await harness(t, [names[0], ordinaryName], {
    memberStatuses: [8, 8],
    polygonGeometry: true,
  });
  const ordinary = findGraphic(h, ordinaryName);
  const initial = findGraphic(h, names[0]);
  const loads = h.state.loads;
  h.view.popup.selectedFeature = ordinary;
  h.view.popup.visible = true;
  const closes = h.state.closes;
  assert.deepEqual(initial.symbol, getCorrectionSymbol(8));
  assert.deepEqual(
    initial.attributes.workUnitStatus.members.map((member) => member.status),
    [8, 8]
  );
  h.state.memberStatuses = [8, 11];
  h.state.revision = 2;
  assert.equal(await h.state.refresh([names[0]]), true);
  const mixed = findGraphic(h, names[0]);
  assert.notEqual(mixed, initial);
  assert.deepEqual(mixed.symbol, getMixedCorrectionSymbol([8, 11]));
  assert.equal(h.page.products[0].members[1].status, 11);
  assert.equal(findGraphic(h, ordinaryName), ordinary);
  assert.equal(h.state.unregistered.includes(ordinary.layer), false);
  assert.equal(h.view.popup.visible, true);
  assert.equal(h.state.closes, closes);
  h.state.memberStatuses = [11, 11];
  h.state.revision = 3;
  assert.equal(await h.state.refresh([names[0]]), true);
  const scalar = findGraphic(h, names[0]);
  assert.notEqual(scalar, mixed);
  assert.deepEqual(scalar.symbol, getCorrectionSymbol(11));
  assert.deepEqual(
    scalar.attributes.workUnitStatus.members.map((member) => member.status),
    [11, 11]
  );
  assert.equal(findGraphic(h, ordinaryName), ordinary);
  assert.equal(h.map.layers.length, 2);
  assert.equal(h.state.closes, closes);
  assert.equal(h.state.loads, loads + 2, "Symbolization must not trigger extra Product reads");
  h.state.fail = true;
  h.state.memberStatuses = [8, 11];
  assert.equal(await h.state.refresh([names[0]]), false);
  assert.equal(findGraphic(h, names[0]), scalar);
  assert.deepEqual(scalar.symbol, getCorrectionSymbol(11));
  assert.equal(findGraphic(h, ordinaryName), ordinary);
  assert.equal(h.view.popup.visible, true);
});

test("failed package refresh retains its accepted mixed Graphic and symbol", async (t) => {
  const h = await harness(t, [names[0], ordinaryName], {
    memberStatuses: [8, 11],
    polygonGeometry: true,
  });
  const accepted = findGraphic(h, names[0]);
  const symbol = accepted.symbol;
  const members = h.page.products[0].members;
  assert.deepEqual(symbol, getMixedCorrectionSymbol([8, 11]));
  h.state.fail = true;
  h.state.memberStatuses = [8, 8];
  assert.equal(await h.state.refresh([names[0]]), false);
  assert.equal(findGraphic(h, names[0]), accepted);
  assert.equal(accepted.symbol, symbol);
  assert.equal(h.page.products[0].members, members);
});

test("late artifact history cannot overwrite a newer accepted package member snapshot", async (t) => {
  const artifacts = artifactHarness();
  const h = await harness(t, names, {
    fetchProducts: (requested) => fetchOwnedAnalyzeProducts(requested, artifacts),
  });
  const gate = { started: deferred(), done: deferred() };
  artifacts.state.gate = gate;
  const oldRefresh = h.state.refresh([names[0]]);
  await gate.started.promise;
  let newer;
  try {
    artifacts.state.response = { Data: [validationArtifact(1)] };
    artifacts.state.edition = 2;
    await h.page.loadAnalyzeDatasetNames(names);
    newer = h.page.products[0];
    assert.deepEqual(
      newer.members.map((member) => member.internalValidationReports.map((report) => report.id)),
      [[], [validationArtifact(1).Id]]
    );
    assert.equal(h.map.layers.flatMap((layer) => layer.graphics).length, 1);
    assert.equal(findGraphic(h, names[0]).symbol.type, "cim");
  } finally {
    gate.done.resolve();
    assert.equal(await oldRefresh, false);
  }
  assert.equal(h.page.products[0], newer);
  assert.deepEqual(h.state.route, [names[0]]);
});

test("targeted package refresh publishes scoped member reports through the accepted map lifecycle", async (t) => {
  const artifacts = artifactHarness();
  const h = await harness(t, [names[0], ordinaryName], {
    fetchProducts: async (requested) => {
      const products = requested.some((name) => names.includes(name))
        ? await fetchOwnedAnalyzeProducts([names[0]], artifacts)
        : [];
      return requested.includes(ordinaryName) ? [...products, simpleProduct()] : products;
    },
  });
  const ordinary = findGraphic(h, ordinaryName);
  h.view.popup.selectedFeature = ordinary;
  h.view.popup.visible = true;
  artifacts.state.response = { Data: [validationArtifact(0)] };
  assert.equal(await h.state.refresh([names[0]]), true);
  assert.deepEqual(
    h.page.products[0].members.map((member) =>
      member.internalValidationReports.map((report) => report.id)
    ),
    [[validationArtifact(0).Id], []]
  );
  assert.equal(findGraphic(h, ordinaryName), ordinary);
  assert.equal(h.view.popup.visible, true);
  assert.equal(h.state.unregistered.includes(ordinary.layer), false);
});
