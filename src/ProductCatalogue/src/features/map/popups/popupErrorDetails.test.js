import assert from "node:assert/strict";
import test from "node:test";
import { createPopupErrorDetails } from "./popupErrorDetails.js";

function createDom() {
  class Target {
    listeners = new Map();
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) {
      this.listeners.get(type)?.delete(handler);
    }
    emit(type, values = {}) {
      const event = {
        target: this,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
        ...values,
      };
      for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
      return event;
    }
    listenerCount() {
      return [...this.listeners.values()].reduce((count, set) => count + set.size, 0);
    }
  }
  const doc = new Target();
  class Element extends Target {
    children = [];
    attributes = new Map();
    style = {};
    offsetWidth = 360;
    offsetHeight = 180;
    constructor(tag) {
      super();
      this.tagName = tag;
    }
    get isConnected() {
      return this === doc.body || Boolean(this.parent?.isConnected);
    }
    append(...children) {
      children.forEach((child) => this.appendChild(child));
    }
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
    }
    remove() {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    contains(target) {
      return target === this || this.children.some((child) => child.contains(target));
    }
    setAttribute(key, value) {
      this.attributes.set(key, value);
    }
    getAttribute(key) {
      return this.attributes.get(key);
    }
    getBoundingClientRect() {
      return { left: 900, top: 400, bottom: 420 };
    }
    focus() {
      if (doc.activeElement !== this) {
        doc.activeElement = this;
        this.emit("focus");
      }
    }
  }
  doc.createElement = (tag) => new Element(tag);
  doc.body = new Element("body");
  const win = new Target();
  win.innerWidth = 1024;
  win.innerHeight = 768;
  return { doc, win };
}

function createHarness() {
  const { doc, win } = createDom();
  const controller = createPopupErrorDetails({ document: doc, window: win });
  const message = "<script>Do not execute</script>\n" + "Complete error ".repeat(100);
  const button = controller.createTrigger(message, { key: "member", label: "Member" });
  doc.body.appendChild(button);
  return {
    doc,
    win,
    controller,
    message,
    button,
    overlay: () => doc.body.children.find((child) => child.className === "popup-error-details"),
  };
}

test("compact errors expose selectable full text on hover and native button activation", () => {
  const h = createHarness();
  assert.equal(h.button.tagName, "button");
  assert.equal(h.button.type, "button");
  assert.equal(h.button.textContent, "Error");
  assert.equal(h.controller.createTrigger("", { key: "empty", label: "Empty" }), null);
  h.button.emit("pointerenter");
  assert.equal(h.overlay().children[1].textContent, h.message);
  assert.equal(h.overlay().children[1].children.length, 0);
  assert.equal(h.overlay().parent, h.doc.body);
  assert.equal(h.overlay().style.left, "656px");
  assert.equal(h.overlay().style.top, "212px");
  h.button.emit("click");
  assert.equal(h.doc.activeElement, h.overlay());
  assert.equal(h.button.getAttribute("aria-expanded"), "true");
  h.button.emit("pointerleave");
  assert.ok(h.overlay());
  h.controller.destroy();
  assert.equal(h.overlay(), undefined);
  assert.equal(h.doc.listenerCount(), 0);
  assert.equal(h.win.listenerCount(), 0);
});

test("focus opens error details and Escape restores focus without reopening or closing the feature popup", () => {
  const h = createHarness();
  h.button.focus();
  assert.ok(h.overlay());
  h.button.emit("click");
  const escape = h.doc.emit("keydown", { key: "Escape" });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.stopped, true);
  assert.equal(h.overlay(), undefined);
  assert.equal(h.doc.activeElement, h.button);
  assert.equal(h.button.getAttribute("aria-expanded"), "false");
  assert.equal(h.doc.listenerCount(), 0);
  h.controller.destroy();
});

test("outside pointer dismissal does not steal focus and disposal prevents detached controls reopening", () => {
  const h = createHarness();
  h.button.emit("click");
  const other = h.doc.createElement("button");
  h.doc.body.appendChild(other);
  other.focus();
  h.doc.emit("pointerdown", { target: other });
  assert.equal(h.overlay(), undefined);
  assert.equal(h.doc.activeElement, other);
  h.controller.destroy();
  h.button.emit("click");
  assert.equal(h.overlay(), undefined);
});

test("metadata replacement restores the matching error control without carrying stale text", () => {
  const h = createHarness();
  h.button.emit("click");
  const key = h.controller.beforeRender();
  assert.equal(key, "member");
  assert.equal(h.overlay(), undefined);
  h.button.remove();
  const next = h.controller.createTrigger("New result", { key: "member", label: "Member" });
  h.doc.body.appendChild(next);
  h.controller.afterRender(key);
  assert.equal(h.doc.activeElement, next);
  assert.equal(h.overlay().children[1].textContent, "New result");
  next.remove();
  h.win.emit("resize");
  assert.equal(h.overlay(), undefined);
  h.controller.destroy();
});

test("when an error disappears, refresh focuses the metadata fallback only if the error owned focus", () => {
  const h = createHarness();
  const fallback = h.doc.createElement("section");
  h.doc.body.appendChild(fallback);
  h.button.emit("click");
  const key = h.controller.beforeRender();
  h.controller.afterRender(key, fallback);
  assert.equal(h.doc.activeElement, fallback);
  const noFocusedError = h.controller.beforeRender();
  h.button.focus();
  h.controller.afterRender(noFocusedError, fallback);
  assert.equal(h.doc.activeElement, h.button);
  h.controller.destroy();
});

test("keyboard focus leaving pinned details dismisses the overlay without moving focus", () => {
  const h = createHarness();
  h.button.emit("click");
  const next = h.doc.createElement("button");
  h.doc.body.appendChild(next);
  next.focus();
  h.doc.emit("focusin", { target: next });
  assert.equal(h.overlay(), undefined);
  assert.equal(h.doc.activeElement, next);
  assert.equal(h.doc.listenerCount(), 0);
  h.controller.destroy();
});
