import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import {
  createWorkspaceProductContext,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import { createPopupActionGroups } from "../../map/popups/popupActionConfig.js";
import { getCollectionNavigationAvailability } from "../domain/productCollectionNavigation.js";
import {
  addProductCollectionProduct,
  clearProductCollection,
  getProductCollectionSnapshot,
  reconcileProductCollectionSourceProducts,
  removeProductCollectionProduct,
} from "../state/productCollectionStore.js";
import { initProductCollectionTray, openProductCollection } from "./productCollectionTray.js";

beforeEach(() => clearProductCollection());

function mainMapContext(source, datasetName = "PRIMARY") {
  return resolveProductContext({
    graphic: {
      attributes: {
        sourceId: source.id,
        productKey: datasetName,
        datasetName,
        productType: source.productType,
      },
      layer: {
        appSourceDefinition: source,
        appSourceId: source.id,
        appProductType: source.productType,
        customId: source.layerDefinitions[0].id,
      },
    },
  });
}

function packageContext() {
  return mainMapContext(createDataSourceRegistry().byId.get("s101"));
}

function restrictedContext() {
  const source = createDataSourceRegistry().byId.get("s101");
  return mainMapContext({
    ...source,
    workUnit: {
      ...source.workUnit,
      navigationCapabilities: { analyze: true, review: false, history: false },
    },
  });
}

function navigationHarness(t) {
  const previousWindow = globalThis.window;
  globalThis.window = { location: new URL("https://catalogue.example/") };
  t.after(() => {
    globalThis.window = previousWindow;
  });
  const calls = [];
  return {
    calls,
    launch: (url, destination) => {
      calls.push({ url, destination });
      return { opened: true };
    },
    showError: () => assert.fail("No notice is expected"),
  };
}

test("Main-map package exposes Analyze, Review and History while collection destinations stay unchanged", () => {
  const source = createDataSourceRegistry().byId.get("s101");
  const context = mainMapContext(source);
  const groups = createPopupActionGroups({ productContext: context });
  assert.deepEqual(
    groups.flat().map((action) => action.id),
    ["tools"]
  );
  assert.deepEqual(
    groups[0][0].items.map((action) => action.id),
    ["analyze", "review", "history"]
  );
  assert.equal(context.capabilities.analyze, true);
  assert.equal(context.capabilities.productCollection, true);
  assert.equal(context.capabilities.backendProductRefresh, true);
  assert.equal(context.capabilities.review, true);
  for (const capability of ["history"]) {
    assert.equal(context.capabilities[capability], true);
    assert.equal(source.capabilities[capability], true);
  }
  const direct = createWorkspaceProductContext({
    sourceId: source.id,
    sourceLabel: source.label,
    productKey: "PRIMARY",
    datasetName: "PRIMARY",
    productType: source.productType,
    capabilities: source.capabilities,
    contentConfiguration: source.contentConfiguration,
  });
  assert.equal(direct.workUnit, null);
  assert.equal(direct.capabilities.analyze, true);
  assert.equal(direct.capabilities.review, true);
  assert.equal(direct.capabilities.history, true);
  const s57 = createDataSourceRegistry().byId.get("s57");
  assert.equal(s57.workspace.supported, true);
  assert.equal(s57.userSelectable, false);
});

test("package remains one stable item with immutable destination permissions through reconciliation", () => {
  const context = packageContext();
  const added = addProductCollectionProduct(context);
  assert.equal(addProductCollectionProduct(packageContext()).added, false);
  reconcileProductCollectionSourceProducts(context.sourceId, [{ productKey: context.productKey }]);
  const snapshot = getProductCollectionSnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.items[0].id, added.item.id);
  assert.equal(snapshot.items[0].id, context.identityKey);
  assert.deepEqual(snapshot.items[0].navigationCapabilities, { analyze: true, review: true });
  assert.equal(Object.isFrozen(snapshot.items[0].navigationCapabilities), true);
  assert.equal(snapshot.items[0].workUnit, undefined);
  removeProductCollectionProduct(context);
  assert.equal(getProductCollectionSnapshot().count, 0);
});

for (const mixed of [false, true]) {
  test(`package collection enables canonical Analyze and Review (mixed: ${mixed})`, (t) => {
    const navigation = navigationHarness(t);
    if (mixed) addProductCollectionProduct("SIMPLE");
    addProductCollectionProduct(packageContext());
    assert.equal(openProductCollection("analyze", navigation), true);
    assert.equal(
      navigation.calls[0].url,
      mixed ? "/Analyze?Datasets=SIMPLE%2CPRIMARY" : "/Analyze?Datasets=PRIMARY"
    );
    const availability = getCollectionNavigationAvailability(
      getProductCollectionSnapshot().items,
      "review"
    );
    assert.equal(availability.allowed, true);
    assert.equal(openProductCollection("review", navigation), true);
    assert.equal(
      navigation.calls[1].url,
      mixed ? "/Review?Datasets=SIMPLE%2CPRIMARY" : "/Review?Datasets=PRIMARY"
    );
    assert.equal(navigation.calls.length, 2);
  });
}

test("generic per-destination capabilities preserve supported simple and compatibility routes", (t) => {
  const navigation = navigationHarness(t);
  const template = createDataSourceRegistry().byId.get("s101");
  const source = { ...template, id: "arbitrary-provider", label: "Arbitrary", workUnit: null };
  addProductCollectionProduct("A&B");
  addProductCollectionProduct(mainMapContext(source, "SECOND"));
  assert.equal(openProductCollection("analyze", navigation), true);
  assert.equal(openProductCollection("review", navigation), true);
  assert.deepEqual(navigation.calls, [
    { url: "/Analyze?Datasets=A%26B%2CSECOND", destination: "analyze" },
    { url: "/Review?Datasets=A%26B%2CSECOND", destination: "review" },
  ]);
  addProductCollectionProduct(
    mainMapContext(
      {
        ...source,
        id: "restricted-provider",
        workUnit: { navigationCapabilities: { analyze: false, history: false } },
      },
      "THIRD"
    )
  );
  assert.equal(openProductCollection("analyze", navigation), false);
  assert.equal(openProductCollection("review", navigation), true);
  assert.equal(navigation.calls.length, 3);
});

test("dispatch rechecks the latest collection and never launches a previously enabled subset", (t) => {
  const navigation = navigationHarness(t);
  addProductCollectionProduct("SIMPLE");
  assert.equal(
    getCollectionNavigationAvailability(getProductCollectionSnapshot().items, "review").allowed,
    true
  );
  addProductCollectionProduct(restrictedContext());
  assert.equal(openProductCollection("review", navigation), false);
  assert.deepEqual(navigation.calls, []);
  removeProductCollectionProduct(restrictedContext());
  assert.equal(openProductCollection("review", navigation), true);
  assert.equal(navigation.calls[0].url, "/Review?Datasets=SIMPLE");
});

test("missing permissions, empty collections and unknown destinations fail closed", (t) => {
  const navigation = navigationHarness(t);
  assert.equal(openProductCollection("analyze", navigation), false);
  const context = packageContext();
  addProductCollectionProduct({ ...context, capabilities: undefined });
  assert.equal(openProductCollection("review", navigation), false);
  assert.equal(openProductCollection("unknown", navigation), false);
  assert.deepEqual(navigation.calls, []);
});

test("tray preserves disabled action layout and guards even a stale click callback", (t) => {
  const navigation = navigationHarness(t);
  const previousDocument = globalThis.document;
  const opened = [];
  globalThis.window.open = (url) => {
    opened.push(url);
    return { opener: {} };
  };
  class Element {
    children = [];
    dataset = {};
    listeners = {};
    attributes = {};
    append(...children) {
      this.children.push(...children);
    }
    appendChild(child) {
      this.children.push(child);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    }
    remove() {}
  }
  const body = new Element();
  globalThis.document = { body, createElement: () => new Element() };
  t.after(() => {
    globalThis.document = previousDocument;
  });
  addProductCollectionProduct("SIMPLE");
  const tray = initProductCollectionTray({ root: body });
  t.after(() => tray.destroy());
  const originalActions = tray.element.children[2].children;
  assert.equal(
    originalActions.every((button) => !button.disabled),
    true
  );
  addProductCollectionProduct(restrictedContext());
  const blockedActions = tray.element.children[2].children;
  assert.deepEqual(
    blockedActions.map((button) => button.textContent),
    ["Review", "Analyze"]
  );
  for (const button of blockedActions.filter((button) => button.textContent === "Review")) {
    assert.equal(button.disabled, true);
    assert.match(button.title, /not available for all collected work units/);
    assert.equal(button.attributes["aria-label"], button.title);
    button.listeners.click();
  }
  assert.equal(blockedActions.find((button) => button.textContent === "Analyze").disabled, false);
  originalActions.find((button) => button.textContent === "Review").listeners.click();
  assert.deepEqual(opened, []);
  assert.deepEqual(navigation.calls, []);
});

test("package popup Review launches the canonical representative and History is available", (t) => {
  navigationHarness(t);
  const opened = [];
  globalThis.window.open = (url, target) => {
    opened.push({ url, target });
    return { opener: {} };
  };
  const context = packageContext();
  const tools = createPopupActionGroups({ productContext: context })
    .flat()
    .find((action) => action.id === "tools");
  tools.items.find((action) => action.id === "review").onClick();
  assert.deepEqual(opened, [{ url: "/Review?Datasets=PRIMARY", target: "_blank" }]);
  assert.equal(
    tools.items.some((action) => action.id === "history"),
    true
  );
  const restricted = createPopupActionGroups({ productContext: restrictedContext() })
    .flat()
    .find((action) => action.id === "tools");
  assert.equal(
    restricted.items.some((action) => action.id === "review"),
    false
  );
});
