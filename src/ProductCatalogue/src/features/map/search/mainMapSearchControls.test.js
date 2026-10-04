import assert from "node:assert/strict";
import test from "node:test";

import { createLocatorLayoutTransitionController } from "./mainMapSearchControls.js";

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
