import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocatorLayoutTransitionController,
  initMainMapSearchControls,
} from "./mainMapSearchControls.js";

function createTransitionTarget() {
  const listeners = new Set();
  return {
    addEventListener(type, listener) {
      if (type === "transitionend") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "transitionend") listeners.delete(listener);
    },
    emit(propertyName = "flex-basis") {
      for (const listener of [...listeners]) {
        listener({ target: this, propertyName });
      }
    },
    snapshotListeners() {
      return [...listeners];
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createController({ reducedMotion = false } = {}) {
  const host = { dataset: {} };
  const transitionTarget = createTransitionTarget();
  const controller = createLocatorLayoutTransitionController({
    host,
    transitionTarget,
    prefersReducedMotion: () => reducedMotion,
  });
  return { controller, host, transitionTarget };
}

test("Locator layout close enters collapsing state before transition completion", () => {
  const { controller, host, transitionTarget } = createController();

  assert.equal(controller.setOpen(true), true);
  assert.equal(host.dataset.locatorState, "open");
  assert.equal(host.dataset.locatorOpen, "true");

  assert.equal(controller.setOpen(false), true);
  assert.equal(controller.getState(), "closing");
  assert.equal(host.dataset.locatorState, "closing");
  assert.equal(host.dataset.locatorOpen, "false");
  assert.equal(transitionTarget.listenerCount(), 1);
});

test("Locator layout finalizes collapsed state after flex-basis transition", () => {
  const { controller, host, transitionTarget } = createController();

  controller.setOpen(true);
  controller.setOpen(false);
  transitionTarget.emit("width");
  assert.equal(controller.getState(), "closing");

  transitionTarget.emit("flex-basis");
  assert.equal(controller.getState(), "closed");
  assert.equal(host.dataset.locatorState, "closed");
  assert.equal(host.dataset.locatorOpen, "false");
  assert.equal(transitionTarget.listenerCount(), 0);
});

test("rapid close then open prevents stale close completion from collapsing the new state", () => {
  const { controller, host, transitionTarget } = createController();

  controller.setOpen(true);
  controller.setOpen(false);
  const [staleCloseListener] = transitionTarget.snapshotListeners();

  assert.equal(controller.setOpen(true), true);
  assert.equal(controller.getState(), "open");
  assert.equal(transitionTarget.listenerCount(), 0);

  staleCloseListener?.({ target: transitionTarget, propertyName: "flex-basis" });

  assert.equal(controller.getState(), "open");
  assert.equal(host.dataset.locatorState, "open");
  assert.equal(host.dataset.locatorOpen, "true");
});

test("repeated close while collapsing is harmless", () => {
  const { controller, transitionTarget } = createController();

  controller.setOpen(true);
  assert.equal(controller.setOpen(false), true);
  assert.equal(controller.setOpen(false), false);
  assert.equal(controller.getState(), "closing");
  assert.equal(transitionTarget.listenerCount(), 1);
});

test("reduced motion finalizes close immediately without waiting for a transition", () => {
  const { controller, host, transitionTarget } = createController({ reducedMotion: true });

  controller.setOpen(true);
  assert.equal(controller.setOpen(false), true);

  assert.equal(controller.getState(), "closed");
  assert.equal(host.dataset.locatorState, "closed");
  assert.equal(host.dataset.locatorOpen, "false");
  assert.equal(transitionTarget.listenerCount(), 0);
});

function createFakeElement(tagName = "div") {
  const children = [];
  const node = {
    tagName,
    id: "",
    className: "",
    dataset: {},
    parentNode: null,
    children,
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
    append(...elements) {
      for (const element of elements) {
        element.parentNode = node;
        children.push(element);
      }
    },
    prepend(element) {
      element.parentNode = node;
      children.unshift(element);
    },
    remove() {
      if (!node.parentNode) return;
      const index = node.parentNode.children.indexOf(node);
      if (index >= 0) node.parentNode.children.splice(index, 1);
      node.parentNode = null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return node;
}

test("mounts Main-map searches before navbar actions, not in a floating map overlay", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const header = createFakeElement();
  const actions = createFakeElement();
  const filterAction = createFakeElement("calcite-action");
  filterAction.id = "filter-button";
  actions.append(filterAction);
  header.querySelector = (selector) => (selector === ".header-right" ? actions : null);
  const elements = new Map([["header", header]]);
  globalThis.document = {
    getElementById: (id) => elements.get(id) ?? null,
    createElement: createFakeElement,
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };

  try {
    const controls = initMainMapSearchControls();
    assert.equal(actions.children[0], controls.host);
    assert.equal(actions.children[1], filterAction);
    assert.deepEqual(controls.host.children, [controls.productSearchHost, controls.locatorHost]);
    assert.equal(controls.productSearchHost.dataset.onboardingTarget, "product-search");
    assert.equal(header.classList.contains("has-main-map-search"), true);

    controls.setLocatorOpen(true);
    assert.equal(controls.host.dataset.locatorOpen, "true");
    controls.destroy();
    assert.equal(actions.children.includes(controls.host), false);
    assert.equal(header.classList.contains("has-main-map-search"), false);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("does not mount Main-map search controls on routes without a navbar action host", () => {
  const previousDocument = globalThis.document;
  const header = createFakeElement();
  header.querySelector = () => null;
  globalThis.document = { getElementById: () => header };

  try {
    const controls = initMainMapSearchControls();
    assert.equal(controls.host, null);
    assert.equal(controls.locatorHost, null);
    assert.equal(controls.setLocatorOpen(true), undefined);
  } finally {
    globalThis.document = previousDocument;
  }
});
