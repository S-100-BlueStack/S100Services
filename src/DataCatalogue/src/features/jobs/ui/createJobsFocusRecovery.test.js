import assert from "node:assert/strict";
import test from "node:test";
import { createJobsFocusRecovery } from "./createJobsFocusRecovery.js";

function fixture() {
  const doc = { activeElement: null, body: null };
  class Element {
    constructor(name, { jobId, action, disabled = false } = {}) {
      this.name = name;
      this.dataset = { ...(jobId ? { jobId } : {}), ...(action ? { jobFocus: action } : {}) };
      this.disabled = disabled;
      this.focusVisible = false;
      this.children = [];
      this.parent = null;
      this.isConnected = true;
      this.handlers = new Map();
      this.classList = { contains: (value) => this.name === value };
    }
    append(...children) {
      for (const child of children) child.parent = this;
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    contains(other) {
      return this === other || this.children.some((child) => child.contains(other));
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (selector === "[data-job-focus]" && node.dataset.jobFocus) return node;
        if (selector === "[data-job-id]" && node.dataset.jobId) return node;
        node = node.parent;
      }
      return null;
    }
    querySelectorAll(selector) {
      const found = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (
            (selector === "[data-job-focus]" && child.dataset.jobFocus) ||
            (selector === "[data-job-id]" && child.dataset.jobId)
          )
            found.push(child);
          visit(child);
        }
      };
      visit(this);
      return found;
    }
    matches(selector) {
      return selector === ":focus-visible" && this.focusVisible;
    }
    addEventListener(type, callback) {
      this.handlers.set(type, callback);
    }
    dispatch(type) {
      this.handlers.get(type)?.({ type });
    }
    focus(options) {
      doc.activeElement = this;
      this.focusOptions = options;
    }
  }
  const root = new Element("job-list");
  doc.body = new Element("body");
  const manager = createJobsFocusRecovery(root, doc);
  return { Element, root, doc, manager };
}

test("keyboard status control restores logical focus after its subtree is replaced", () => {
  const { Element, root, doc, manager } = fixture();
  const oldCard = new Element("card", { jobId: "package-1" });
  const oldStatus = new Element("button", { action: "status:inProgress" });
  oldCard.append(oldStatus);
  root.append(oldCard);
  oldStatus.focus();
  root.dispatch("keydown");
  const capture = manager.capture();
  const newCard = new Element("card", { jobId: "package-1" });
  const newStatus = new Element("button", { action: "status:inProgress" });
  newCard.append(newStatus);
  root.replaceChildren(newCard);
  manager.restore(capture);
  assert.equal(doc.activeElement, newStatus);
  assert.deepEqual(newStatus.focusOptions, { preventScroll: true });
});

test("disabled refresh stays logically pending until the next successful render", () => {
  const { Element, root, doc, manager } = fixture();
  const oldRefresh = new Element("button", { action: "refresh" });
  root.append(oldRefresh);
  oldRefresh.focusVisible = true;
  oldRefresh.focus();
  const initial = manager.capture();
  root.replaceChildren(new Element("button", { action: "refresh", disabled: true }));
  manager.restore(initial);
  assert.equal(doc.activeElement, root);

  const again = manager.capture();
  const newRefresh = new Element("button", { action: "refresh" });
  root.replaceChildren(newRefresh);
  manager.restore(again);
  assert.equal(doc.activeElement, newRefresh);
});

test("disappearing Job falls back to available Refresh without focusing another Job", () => {
  const { Element, root, doc, manager } = fixture();
  const oldCard = new Element("card", { jobId: "A" });
  const oldStatus = new Element("button", { action: "status:todo" });
  oldCard.append(oldStatus);
  root.append(oldCard);
  oldStatus.focusVisible = true;
  oldStatus.focus();
  const capture = manager.capture();
  const cardB = new Element("card", { jobId: "B" });
  cardB.append(new Element("button", { action: "status:todo" }));
  const refresh = new Element("button", { action: "refresh" });
  root.replaceChildren(refresh, cardB);
  manager.restore(capture);
  assert.equal(doc.activeElement, refresh);
});

test("an external focus change prevents stale focus restoration", () => {
  const { Element, root, doc, manager } = fixture();
  const oldButton = new Element("button", { action: "refresh" });
  root.append(oldButton);
  oldButton.focusVisible = true;
  oldButton.focus();
  manager.capture();
  const external = new Element("external");
  external.focus();
  assert.equal(manager.capture(), null);
  root.replaceChildren(new Element("button", { action: "refresh" }));
  manager.restore(null);
  assert.equal(doc.activeElement, external);
});

test("pointer operation does not steal focus from the previous keyboard control", () => {
  const { Element, root, doc, manager } = fixture();
  const oldButton = new Element("button", { action: "refresh" });
  root.append(oldButton);
  oldButton.focusVisible = true;
  oldButton.focus();
  root.dispatch("pointerdown");
  const capture = manager.capture();
  root.replaceChildren(new Element("button", { action: "refresh" }));
  manager.restore(capture);
  assert.notEqual(doc.activeElement, root.children[0]);
});
