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

test("Main-map package has no navigation actions but direct workspace capabilities survive", () => {
  const source = createDataSourceRegistry().byId.get("s101");
  const context = mainMapContext(source);
  assert.deepEqual(createPopupActionGroups({ productContext: context }), []);
  assert.equal(context.capabilities.productCollection, true);
  assert.equal(context.capabilities.backendProductRefresh, true);
  for (const capability of ["analyze", "review", "history"]) {
    assert.equal(context.capabilities[capability], false);
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
  assert.deepEqual(snapshot.items[0].navigationCapabilities, { analyze: false, review: false });
  assert.equal(Object.isFrozen(snapshot.items[0].navigationCapabilities), true);
  assert.equal(snapshot.items[0].workUnit, undefined);
  removeProductCollectionProduct(context);
  assert.equal(getProductCollectionSnapshot().count, 0);
});

for (const mixed of [false, true]) {
  test(`package collection blocks both launch paths (mixed: ${mixed})`, (t) => {
    const navigation = navigationHarness(t);
    if (mixed) addProductCollectionProduct("SIMPLE");
    addProductCollectionProduct(packageContext());
    for (const destination of ["analyze", "review"]) {
      const availability = getCollectionNavigationAvailability(
        getProductCollectionSnapshot().items,
        destination
      );
      assert.equal(availability.allowed, false);
      assert.match(availability.reason, /not available for all collected work units/);
      assert.equal(openProductCollection(destination, navigation), false);
    }
    assert.deepEqual(navigation.calls, []);
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
    getCollectionNavigationAvailability(getProductCollectionSnapshot().items, "analyze").allowed,
    true
  );
  addProductCollectionProduct(packageContext());
  assert.equal(openProductCollection("analyze", navigation), false);
  assert.deepEqual(navigation.calls, []);
  removeProductCollectionProduct(packageContext());
  assert.equal(openProductCollection("analyze", navigation), true);
  assert.equal(navigation.calls[0].url, "/Analyze?Datasets=SIMPLE");
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
  addProductCollectionProduct(packageContext());
  const blockedActions = tray.element.children[2].children;
  assert.deepEqual(
    blockedActions.map((button) => button.textContent),
    ["Review", "Analyze"]
  );
  for (const button of blockedActions) {
    assert.equal(button.disabled, true);
    assert.match(button.title, /not available for all collected work units/);
    assert.equal(button.attributes["aria-label"], button.title);
    button.listeners.click();
  }
  for (const button of originalActions) button.listeners.click();
  assert.deepEqual(opened, []);
  assert.deepEqual(navigation.calls, []);
});
