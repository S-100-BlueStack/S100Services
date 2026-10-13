import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyGlobalHelpTooltips, initGlobalHelpTooltips } from "./globalHelpTooltips.js";
import { bindPopupActionHelp } from "../../../features/map/popups/popupActionHelp.js";
import { hideActiveHelpTooltip } from "./helpTooltip.js";

function createDom() {
  class Target {
    listeners = new Map();
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }
    emit(type, event = {}) {
      const emitted = {
        ...event,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
      };
      for (const listener of this.listeners.get(type) ?? []) listener(emitted);
      return emitted;
    }
  }
  class Element extends Target {
    children = [];
    attributes = new Map();
    parentElement = null;
    style = {};
    textContent = "";
    className = "";
    rect = { left: 120, width: 40, top: 100, bottom: 140 };
    constructor(tagName) {
      super();
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
    }
    get isConnected() {
      return this === doc.documentElement || Boolean(this.parentElement?.isConnected);
    }
    get offsetWidth() {
      return Math.min(170, 18 + this.textContent.length * 6);
    }
    get offsetHeight() {
      return 24;
    }
    getBoundingClientRect() {
      return this.rect;
    }
    getAttribute(key) {
      return this.attributes.get(key) ?? null;
    }
    hasAttribute(key) {
      return this.attributes.has(key);
    }
    setAttribute(key, value) {
      this.attributes.set(key, String(value));
    }
    removeAttribute(key) {
      this.attributes.delete(key);
    }
    appendChild(element) {
      element.remove();
      element.parentElement = this;
      this.children.push(element);
      return element;
    }
    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
        this.parentElement = null;
      }
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains(element));
    }
    matches(selector) {
      return selector.split(",").some((part) => {
        const token = part.trim();
        if (token === "[title]" || token === "[aria-label]") {
          return this.hasAttribute(token.slice(1, -1));
        }
        const qualified = token.match(/^(button|a|input|select|calcite-action)\[aria-label\]$/);
        if (qualified)
          return this.tagName.toLowerCase() === qualified[1] && this.hasAttribute("aria-label");
        if (token.startsWith("#")) return this.getAttribute("id") === token.slice(1);
        if (token.startsWith(".")) return this.className.split(/\s+/).includes(token.slice(1));
        if (token.startsWith("[") && token.endsWith("]")) {
          return this.hasAttribute(token.slice(1, -1));
        }
        return false;
      });
    }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (node.matches(selector)) return node;
      }
      return null;
    }
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (child.matches(selector)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
  }
  class Document extends Target {
    readyState = "complete";
    activeElement = null;
    constructor() {
      super();
      this.documentElement = new Element("html");
      this.body = this.documentElement.appendChild(new Element("body"));
    }
    createElement(tag) {
      return new Element(tag);
    }
    querySelectorAll(selector) {
      return this.documentElement.querySelectorAll(selector);
    }
  }
  const doc = new Document();
  const win = new Target();
  win.innerWidth = 480;
  win.innerHeight = 360;
  win.requestAnimationFrame = (callback) => callback();
  return { doc, win, Element };
}

test("global and popup tooltips share one compact overlay with native title cleanup and keyboard safety", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousObserver = globalThis.MutationObserver;
  const { doc, win, Element } = createDom();
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.MutationObserver = class {
    observe() {}
  };
  let popupHelp;
  try {
    const nav = doc.body.appendChild(new Element("a"));
    nav.setAttribute("data-nav-dashboard-link", "");
    nav.textContent = "Dashboard";
    nav.setAttribute("title", "Dashboard");
    nav.setAttribute("aria-describedby", "existing-help");

    const lastUpdated = doc.body.appendChild(new Element("span"));
    lastUpdated.setAttribute("title", "Last refreshed at 11:45.");
    lastUpdated.setAttribute("aria-label", "Last refreshed at 11:45.");
    lastUpdated.rect = { left: 454, width: 20, top: 32, bottom: 48 };

    const map = doc.body.appendChild(new Element("div"));
    map.setAttribute("id", "viewDiv");
    const arcgisControl = map.appendChild(new Element("button"));
    arcgisControl.setAttribute("title", "ArcGIS map zoom");
    arcgisControl.setAttribute("aria-label", "ArcGIS map zoom");

    initGlobalHelpTooltips();
    assert.equal(nav.hasAttribute("title"), false);
    assert.equal(nav.getAttribute("data-app-original-title"), "Dashboard");
    assert.equal(lastUpdated.hasAttribute("title"), false);
    assert.equal(arcgisControl.getAttribute("title"), "ArcGIS map zoom");

    doc.emit("pointerover", { target: nav });
    let tooltip = doc.body.children.at(-1);
    assert.equal(tooltip.getAttribute("role"), "tooltip");
    assert.equal(tooltip.textContent, "Open Dashboard");
    assert.equal(tooltip.className.includes("pc-help-tooltip"), true);
    assert.match(nav.getAttribute("aria-describedby"), /^existing-help pc-help-tooltip-/);
    assert.equal(tooltip.style.left, "89px");

    // Help is pointer-transparent; leaving the anchor must dismiss it rather than
    // creating a hoverable surface that blocks an adjacent menu item.
    doc.emit("pointerout", { target: nav, relatedTarget: null });
    assert.equal(doc.body.children.length, 3);
    assert.equal(nav.getAttribute("aria-describedby"), "existing-help");

    doc.activeElement = nav;
    doc.emit("focusin", { target: nav });
    tooltip = doc.body.children.at(-1);
    const escape = doc.emit("keydown", { key: "Escape" });
    assert.equal(escape.defaultPrevented, undefined, "global tooltip does not consume Escape");
    assert.equal(escape.stopped, undefined);
    assert.equal(doc.activeElement, nav);
    assert.equal(nav.getAttribute("aria-describedby"), "existing-help");
    assert.equal(doc.body.children.length, 3);

    doc.emit("pointerover", { target: lastUpdated });
    tooltip = doc.body.children.at(-1);
    assert.equal(tooltip.textContent, "Last refreshed at 11:45");
    assert.ok(
      Number.parseFloat(tooltip.style.left) + tooltip.offsetWidth <= win.innerWidth - 8,
      "help stays within the viewport"
    );
    lastUpdated.setAttribute("title", "Last refreshed at 11:46.");
    applyGlobalHelpTooltips(doc);
    assert.equal(lastUpdated.hasAttribute("title"), false);
    assert.equal(tooltip.textContent, "Last refreshed at 11:46");

    doc.emit("pointerover", { target: arcgisControl });
    assert.equal(doc.body.children.length, 3, "framework-owned map chrome is not retargeted");

    const attributeHeading = doc.body.appendChild(new Element("th"));
    attributeHeading.setAttribute("aria-label", "Attribute");
    const actionBar = doc.body.appendChild(new Element("div"));
    actionBar.setAttribute("aria-label", "Popup actions");
    const errorTrigger = doc.body.appendChild(new Element("button"));
    errorTrigger.className = "popup-product-error";
    errorTrigger.setAttribute("aria-label", "S-101: show full error");

    applyGlobalHelpTooltips(doc);
    for (const target of [attributeHeading, actionBar, errorTrigger]) {
      assert.equal(target.hasAttribute("data-app-help"), false);
      doc.emit("pointerover", { target });
      assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 0);
    }
    assert.equal(attributeHeading.getAttribute("aria-label"), "Attribute");
    assert.equal(actionBar.getAttribute("aria-label"), "Popup actions");
    assert.equal(errorTrigger.getAttribute("aria-label"), "S-101: show full error");

    const popup = doc.body.appendChild(new Element("button"));
    popupHelp = bindPopupActionHelp(popup, "Discard the package. This cannot be undone.");
    popup.emit("pointerenter");
    tooltip = doc.body.children.at(-1);
    assert.equal(tooltip.textContent, "Discard the package. This cannot be undone");
    doc.emit("pointerover", { target: popup });
    assert.equal(
      doc.body.children.at(-1),
      tooltip,
      "global manager does not rebind popup-owned help"
    );
    assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 1);
  } finally {
    popupHelp?.destroy();
    hideActiveHelpTooltip();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previousObserver;
  }
});

test("shared tooltip styling uses content width instead of a fixed 280px popup box", async () => {
  const css = await readFile(new URL("../../../styles/tooltips.css", import.meta.url), "utf8");
  assert.match(css, /\.pc-help-tooltip\s*\{[^}]*width:\s*max-content;/s);
  assert.match(css, /max-width:\s*min\(320px, calc\(100vw - 16px\)\)/);
  assert.match(css, /pointer-events:\s*none/);
});
