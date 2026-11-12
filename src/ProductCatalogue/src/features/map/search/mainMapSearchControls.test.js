import assert from "node:assert/strict";
import test from "node:test";

import { createNavbarPopoverCoordinator } from "../../../shared/ui/navbarPopoverCoordinator.js";
import { initMainMapSearchControls } from "./mainMapSearchControls.js";

function createFakeElement(tagName = "div") {
  const attributes = new Map();
  const listeners = new Map();
  const styles = new Map();
  const node = {
    tagName,
    id: "",
    className: "",
    dataset: {},
    hidden: false,
    active: false,
    parentNode: null,
    children: [],
    style: {
      setProperty(name, value) {
        styles.set(name, value);
      },
      getPropertyValue(name) {
        return styles.get(name);
      },
    },
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },
    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },
    emit(name, event = {}) {
      for (const handler of listeners.get(name) ?? []) handler({ target: this, ...event });
    },
    append(...elements) {
      for (const element of elements) {
        element.parentNode = node;
        node.children.push(element);
      }
    },
    prepend(element) {
      element.parentNode = node;
      node.children.unshift(element);
    },
    remove() {
      if (!node.parentNode) return;
      const i = node.parentNode.children.indexOf(node);
      if (i >= 0) node.parentNode.children.splice(i, 1);
      node.parentNode = null;
    },
    contains(target) {
      return node === target || node.children.some((child) => child.contains(target));
    },
    getBoundingClientRect() {
      return { left: node === header ? 0 : 480, bottom: 50 };
    },
    focus() {
      globalThis.document.activeElement = node;
    },
  };
  return node;
}

let header = null;
function createHarness() {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  header = createFakeElement("header");
  const actions = createFakeElement();
  const filterButton = createFakeElement("calcite-action");
  filterButton.id = "filter-button";
  actions.append(filterButton);
  header.querySelector = (selector) => (selector === ".header-right" ? actions : null);

  const events = new Map();
  const fakeDocument = {
    activeElement: null,
    documentElement: { clientWidth: 1440 },
    getElementById: (id) => (id === "header" ? header : null),
    createElement: createFakeElement,
    addEventListener(name, listener) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      events.get(name)?.delete(listener);
    },
    emit(name, event) {
      for (const listener of events.get(name) ?? []) listener(event);
    },
  };
  globalThis.document = fakeDocument;
  const windowEvents = new Map();
  globalThis.window = {
    innerWidth: 1440,
    addEventListener(name, listener) {
      if (!windowEvents.has(name)) windowEvents.set(name, new Set());
      windowEvents.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      windowEvents.get(name)?.delete(listener);
    },
  };

  const coordinator = createNavbarPopoverCoordinator({ eventTarget: fakeDocument });
  const controls = initMainMapSearchControls({ navbarPopoverCoordinator: coordinator });
  const counts = {
    closeProduct: 0,
    cancelProduct: 0,
    focusProduct: 0,
    openLocator: 0,
    closeLocator: 0,
  };
  const productSearch = {
    close() {
      counts.closeProduct++;
    },
    cancelPendingSelection() {
      counts.cancelProduct++;
    },
    focusInput() {
      counts.focusProduct++;
    },
  };
  let locatorOpen = false;
  const locator = {
    open() {
      locatorOpen = true;
      controls.setLocatorOpen(true);
      counts.openLocator++;
    },
    close() {
      if (!locatorOpen) return false;
      locatorOpen = false;
      controls.setLocatorOpen(false);
      counts.closeLocator++;
      return true;
    },
    isOpen() {
      return locatorOpen;
    },
  };
  controls.bind({ productSearch, locator });
  coordinator.start();
  return {
    controls,
    counts,
    coordinator,
    actions,
    filterButton,
    document: fakeDocument,
    cleanup() {
      controls.destroy();
      coordinator.destroy();
      globalThis.document = oldDocument;
      globalThis.window = oldWindow;
      header = null;
    },
  };
}

test("mounts two compact search actions before Filters, with closed surfaces", () => {
  const h = createHarness();
  try {
    assert.equal(h.actions.children[0], h.controls.host);
    assert.equal(h.actions.children[1], h.filterButton);
    assert.equal(h.controls.productButton.id, "main-map-product-search-button");
    assert.equal(h.controls.productButton.icon, "search");
    assert.equal(h.controls.productButton.textEnabled, false);
    assert.equal(h.controls.productButton.dataset.onboardingTarget, "product-search");
    assert.deepEqual(h.controls.host.children, [
      h.controls.productButton,
      h.controls.locatorHost,
      h.controls.productSearchHost,
    ]);
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.controls.host.dataset.locatorOpen, "false");
    assert.equal(header.classList.contains("has-main-map-search"), true);
  } finally {
    h.cleanup();
  }
});

test("Product search opens under navbar and closes any other registered popover", () => {
  const h = createHarness();
  try {
    let otherOpen = false;
    h.coordinator.register("filters", {
      open() {
        otherOpen = true;
      },
      close() {
        otherOpen = false;
      },
      isOpen() {
        return otherOpen;
      },
    });
    h.coordinator.open("filters");
    assert.equal(otherOpen, true);

    h.controls.productButton.emit("click");
    assert.equal(otherOpen, false);
    assert.equal(h.controls.productSearchHost.hidden, false);
    assert.equal(h.controls.productButton.getAttribute("aria-expanded"), "true");
    assert.equal(h.counts.focusProduct, 1);
    assert.equal(h.controls.host.style.getPropertyValue("--pc-main-search-top"), "56px");
    assert.equal(h.controls.host.style.getPropertyValue("--pc-main-search-left"), "480px");

    h.coordinator.open("filters");
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.counts.cancelProduct, 1);
  } finally {
    h.cleanup();
  }
});

test("switching Product search and Locator keeps only one active search session", () => {
  const h = createHarness();
  try {
    h.controls.productButton.emit("click");
    h.controls.toggleLocator();
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.counts.cancelProduct, 1);
    assert.equal(h.counts.openLocator, 1);
    assert.equal(h.controls.host.dataset.locatorOpen, "true");

    h.controls.productButton.emit("click");
    assert.equal(h.counts.closeLocator, 1);
    assert.equal(h.controls.host.dataset.locatorOpen, "false");
    assert.equal(h.controls.productSearchHost.hidden, false);

    h.controls.toggleLocator();
    h.controls.toggleLocator();
    assert.equal(h.counts.openLocator, 2);
    assert.equal(h.counts.closeLocator, 2);
    assert.equal(h.controls.host.dataset.locatorOpen, "false");
  } finally {
    h.cleanup();
  }
});

test("Escape closes Product search and restores focus to its action", () => {
  const h = createHarness();
  try {
    h.controls.productButton.emit("click");
    const event = {
      key: "Escape",
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    h.document.emit("keydown", event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.document.activeElement, h.controls.productButton);
  } finally {
    h.cleanup();
  }
});

test("outside click closes Product search and cancels pending Product navigation", () => {
  const h = createHarness();
  try {
    h.controls.productButton.emit("click");
    h.document.emit("click", { target: createFakeElement() });
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.counts.cancelProduct, 1);
    assert.equal(h.counts.closeProduct, 1);
  } finally {
    h.cleanup();
  }
});

test("selection-complete closes the floating Product surface without restoring button focus", () => {
  const h = createHarness();
  try {
    h.controls.productButton.emit("click");
    h.controls.closeProductAfterSelection();
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.document.activeElement, null);
  } finally {
    h.cleanup();
  }
});

test("hiding a search surface after selection never strands keyboard focus inside it", () => {
  const h = createHarness();
  try {
    const input = createFakeElement("input");
    h.controls.productSearchHost.append(input);
    h.controls.productButton.emit("click");
    input.focus();
    h.controls.closeProductAfterSelection();
    assert.equal(h.controls.productSearchHost.hidden, true);
    assert.equal(h.document.activeElement, h.controls.productButton);
  } finally {
    h.cleanup();
  }
});

test("destroy unregisters search popovers and removes both actions", () => {
  const h = createHarness();
  try {
    h.controls.productButton.emit("click");
    h.controls.destroy();
    assert.equal(h.coordinator.getActiveId(), null);
    assert.equal(h.actions.children.includes(h.controls.host), false);
    assert.equal(header.classList.contains("has-main-map-search"), false);
    assert.equal(h.controls.toggleLocator(), false);
  } finally {
    h.cleanup();
  }
});

test("does not mount Main-map search controls on routes without a navbar action host", () => {
  const oldDocument = globalThis.document;
  const fakeHeader = createFakeElement();
  fakeHeader.querySelector = () => null;
  globalThis.document = { getElementById: () => fakeHeader };
  try {
    const controls = initMainMapSearchControls();
    assert.equal(controls.host, null);
    assert.equal(controls.locatorHost, null);
    assert.equal(controls.toggleLocator(), false);
    assert.equal(controls.bind(), false);
  } finally {
    globalThis.document = oldDocument;
  }
});
