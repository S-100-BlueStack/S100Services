import assert from "node:assert/strict";
import test from "node:test";
import { bindPopupActionHelp, hideActivePopupActionHelp } from "./popupActionHelp.js";

function withDom(run) {
  class Target {
    listeners = new Map();
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    emit(type, properties = {}) {
      const event = {
        key: null,
        preventDefault() {
          this.prevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
        ...properties,
      };
      for (const fn of this.listeners.get(type) ?? []) fn(event);
      return event;
    }
  }
  class Element extends Target {
    attributes = new Map();
    children = [];
    style = {};
    constructor(tag) {
      super();
      this.tagName = tag;
    }
    appendChild(child) {
      child.remove();
      child.parent = this;
      this.children.push(child);
    }
    get isConnected() {
      return this === doc.body || Boolean(this.parent?.isConnected);
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
      this.parent = null;
    }
    get offsetWidth() {
      return 100;
    }
    get offsetHeight() {
      return 30;
    }
    contains(element) {
      return this === element || this.children.some((c) => c.contains(element));
    }
    getBoundingClientRect() {
      return { left: 10, top: 20, bottom: 50 };
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    closest(selector) {
      return selector === ".popup-action-dropdown" ? (this.menuParent ?? null) : null;
    }
  }
  const doc = new Target();
  doc.body = new Element("body");
  doc.createElement = (tag) => new Element(tag);
  const win = new Target();
  win.innerWidth = 800;
  win.innerHeight = 600;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = doc;
  globalThis.window = win;
  const createAnchor = () => {
    const anchor = new Element("button");
    doc.body.appendChild(anchor);
    return anchor;
  };
  try {
    return run({ doc, win, createAnchor });
  } finally {
    hideActivePopupActionHelp();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("popup action help shares one overlay across actions and updates in place", () => {
  withDom(({ doc, createAnchor }) => {
    const first = createAnchor();
    const second = createAnchor();
    first.setAttribute("title", "Old native tooltip");
    const helpA = bindPopupActionHelp(first, "Pause the package.");
    const helpB = bindPopupActionHelp(second, "Discard the package");
    helpA.update("Pause the package.");
    assert.equal(first.hasAttribute("title"), false);
    first.emit("pointerenter");
    const bubble = doc.body.children.at(-1);
    assert.equal(bubble.getAttribute("role"), "tooltip");
    assert.equal(first.getAttribute("aria-describedby"), bubble.id);
    helpA.update("Resume the package");
    assert.equal(doc.body.children.at(-1), bubble);
    assert.equal(bubble.textContent, "Resume the package");
    second.emit("focusin");
    assert.equal(first.hasAttribute("aria-describedby"), false);
    assert.equal(doc.body.children.at(-1).textContent, "Discard the package");
    assert.equal(doc.body.children.length, 3);
    helpA.destroy();
    helpB.destroy();
    assert.equal(doc.body.children.length, 2);
    assert.equal(doc.listeners.get("keydown")?.size ?? 0, 0);
  });
});

test("Escape dismisses focused help without changing focus, and disconnect cleanup removes listeners", () => {
  withDom(({ doc, win, createAnchor }) => {
    const anchor = createAnchor();
    const help = bindPopupActionHelp(anchor, "Show details.");
    anchor.emit("focusin");
    const event = doc.emit("keydown", { key: "Escape" });
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(anchor.hasAttribute("aria-describedby"), false);
    assert.equal(doc.body.children.length, 1);
    anchor.emit("focusout");
    anchor.emit("focusin");
    assert.equal(doc.body.children.length, 2);
    help.destroy();
    assert.equal(doc.body.children.length, 1);
    assert.equal(doc.listeners.get("scroll")?.size ?? 0, 0);
    assert.equal(win.listeners.get("resize")?.size ?? 0, 0);
    anchor.emit("pointerenter");
    assert.equal(doc.body.children.length, 1);
  });
});

test("Escape in a Tools dropdown also reaches the menu's own keyboard handler", () => {
  withDom(({ doc, createAnchor }) => {
    const item = createAnchor();
    item.menuParent = {};
    const help = bindPopupActionHelp(item, "Open Review.");
    item.emit("pointerenter");
    const event = doc.emit("keydown", { key: "Escape" });
    assert.equal(event.stopped, undefined);
    assert.equal(doc.body.children.length, 1);
    help.destroy();
  });
});

test("mouse help follows the pointer and allows adjacent Tools items to take hover", () => {
  withDom(({ doc, createAnchor }) => {
    const first = createAnchor();
    const second = createAnchor();
    const firstHelp = bindPopupActionHelp(first, "Open Analyze");
    const secondHelp = bindPopupActionHelp(second, "Open Review");

    first.emit("pointerenter", { clientX: 200, clientY: 100 });
    const bubble = doc.body.children.at(-1);
    assert.equal(bubble.style.left, "214px");
    assert.equal(bubble.style.top, "118px");

    first.emit("pointermove", { clientX: 260, clientY: 125 });
    assert.equal(bubble.style.left, "274px");
    assert.equal(bubble.style.top, "143px");

    first.emit("pointerleave", { relatedTarget: second });
    assert.equal(doc.body.children.length, 2, "moving to a neighbor removes previous help");
    second.emit("pointerenter", { clientX: 315, clientY: 165 });
    assert.equal(doc.body.children.at(-1).textContent, "Open Review");
    assert.equal(doc.body.children.at(-1).style.left, "329px");
    assert.equal(doc.body.children.length, 3, "only one help surface is present");

    second.emit("pointermove", { clientX: 790, clientY: 595 });
    const moved = doc.body.children.at(-1);
    assert.equal(moved.style.left, "676px", "help flips before the right edge");
    assert.equal(moved.style.top, "553px", "help flips above the bottom edge");
    second.emit("pointerleave");
    assert.equal(doc.body.children.length, 2);
    second.emit("focusin");
    assert.equal(doc.body.children.at(-1).style.top, "50px", "keyboard uses anchor placement");

    firstHelp.destroy();
    secondHelp.destroy();
    assert.equal(doc.body.children.length, 2);
  });
});
