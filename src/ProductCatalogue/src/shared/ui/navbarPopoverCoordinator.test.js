import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNavbarPopoverCoordinator } from "./navbarPopoverCoordinator.js";

describe("navbarPopoverCoordinator", () => {
  it("keeps only one registered navbar popover open", () => {
    const eventTarget = createEventTarget();
    const filters = createParticipant("filters");
    const dataSources = createParticipant("data-sources");
    const coordinator = createNavbarPopoverCoordinator({ eventTarget });

    coordinator.register("filters", filters.api);
    coordinator.register("data-sources", dataSources.api);

    assert.equal(coordinator.open("filters"), true);
    assert.equal(filters.isOpen(), true);

    assert.equal(coordinator.open("data-sources"), true);
    assert.equal(filters.isOpen(), false);
    assert.equal(dataSources.isOpen(), true);
    assert.equal(coordinator.getActiveId(), "data-sources");
  });

  it("closes Data sources when Filters opens", () => {
    const dataSources = createParticipant("data-sources");
    const filters = createParticipant("filters");
    const coordinator = createNavbarPopoverCoordinator({ eventTarget: createEventTarget() });

    coordinator.register("data-sources", dataSources.api);
    coordinator.register("filters", filters.api);
    coordinator.open("data-sources");
    coordinator.open("filters");

    assert.equal(dataSources.isOpen(), false);
    assert.equal(filters.isOpen(), true);
    assert.equal(coordinator.getActiveId(), "filters");
  });

  it("toggles the active popover closed and restores focus", () => {
    const filters = createParticipant("filters");
    const coordinator = createNavbarPopoverCoordinator({ eventTarget: createEventTarget() });
    coordinator.register("filters", filters.api);

    coordinator.toggle("filters");
    assert.equal(coordinator.toggle("filters"), true);
    assert.equal(filters.isOpen(), false);
    assert.equal(filters.focusRestoreCount, 1);
  });

  it("closes the active popover on Escape and restores the correct trigger", () => {
    const eventTarget = createEventTarget();
    const dataSources = createParticipant("data-sources");
    const coordinator = createNavbarPopoverCoordinator({ eventTarget });
    coordinator.register("data-sources", dataSources.api);
    coordinator.start();
    coordinator.open("data-sources");

    const event = createKeyboardEvent("Escape");
    eventTarget.dispatch("keydown", event);

    assert.equal(dataSources.isOpen(), false);
    assert.equal(dataSources.focusRestoreCount, 1);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
  });

  it("registers global listeners once across repeated starts and openings", () => {
    const eventTarget = createEventTarget();
    const coordinator = createNavbarPopoverCoordinator({ eventTarget });
    coordinator.register("filters", createParticipant("filters").api);

    assert.equal(coordinator.start(), true);
    assert.equal(coordinator.start(), false);
    coordinator.open("filters");
    coordinator.close("filters");
    coordinator.open("filters");

    assert.equal(eventTarget.addCounts.get("click"), 1);
    assert.equal(eventTarget.addCounts.get("keydown"), 1);
  });

  it("supports future registered popovers without changing existing participants", () => {
    const coordinator = createNavbarPopoverCoordinator({ eventTarget: createEventTarget() });
    const filters = createParticipant("filters");
    const future = createParticipant("future");
    coordinator.register("filters", filters.api);
    coordinator.register("future-popover", future.api);

    coordinator.open("filters");
    coordinator.open("future-popover");

    assert.equal(filters.isOpen(), false);
    assert.equal(future.isOpen(), true);
    assert.equal(coordinator.getActiveId(), "future-popover");
  });

  it("closes on outside click but ignores targets owned by the active participant", () => {
    const eventTarget = createEventTarget();
    const insideTarget = {};
    const filters = createParticipant("filters", { insideTarget });
    const coordinator = createNavbarPopoverCoordinator({ eventTarget });
    coordinator.register("filters", filters.api);
    coordinator.start();
    coordinator.open("filters");

    eventTarget.dispatch("click", { target: insideTarget });
    assert.equal(filters.isOpen(), true);

    eventTarget.dispatch("click", { target: {} });
    assert.equal(filters.isOpen(), false);
  });
});

function createParticipant(_id, { insideTarget = null } = {}) {
  let open = false;
  let focusRestoreCount = 0;

  return {
    api: {
      open() {
        open = true;
      },
      close({ restoreFocus = false } = {}) {
        open = false;
        if (restoreFocus) focusRestoreCount += 1;
      },
      isOpen() {
        return open;
      },
      containsTarget(target) {
        return target === insideTarget;
      },
    },
    isOpen: () => open,
    get focusRestoreCount() {
      return focusRestoreCount;
    },
  };
}

function createEventTarget() {
  const listeners = new Map();
  const addCounts = new Map();

  return {
    addCounts,
    addEventListener(type, listener) {
      addCounts.set(type, (addCounts.get(type) ?? 0) + 1);
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

function createKeyboardEvent(key) {
  return {
    key,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}
