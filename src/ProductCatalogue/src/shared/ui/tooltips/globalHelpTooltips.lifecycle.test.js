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
    nav.className = "navbar-title-link";
    nav.setAttribute("data-nav-dashboard-link", "");
    nav.textContent = "Dashboard";
    nav.setAttribute("title", "Open Dashboard");
    nav.setAttribute("aria-describedby", "existing-help");

    const filter = doc.body.appendChild(new Element("calcite-action"));
    filter.setAttribute("id", "filter-button");
    filter.setAttribute("title", "Filters");
    filter.setAttribute("aria-describedby", "filter-help");
    filter.rect = { left: 120, width: 40, top: 100, bottom: 140 };

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
    assert.equal(nav.hasAttribute("data-app-help"), false);
    assert.equal(filter.hasAttribute("title"), false);
    assert.equal(lastUpdated.hasAttribute("title"), false);
    assert.equal(arcgisControl.getAttribute("title"), "ArcGIS map zoom");

    // Visible navbar labels do not display redundant help that competes with
    // the full-height clickable link or its animated route indicator.
    doc.emit("pointerover", { target: nav });
    doc.activeElement = nav;
    doc.emit("focusin", { target: nav });
    assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 0);
    assert.equal(nav.getAttribute("aria-describedby"), "existing-help");

    doc.emit("pointerover", { target: filter });
    let tooltip = doc.body.children.at(-1);
    assert.equal(tooltip.getAttribute("role"), "tooltip");
    assert.equal(tooltip.textContent, "Filters");
    assert.equal(tooltip.className.includes("pc-help-tooltip"), true);
    assert.match(filter.getAttribute("aria-describedby"), /^filter-help pc-help-tooltip-/);
    assert.ok(Number.parseFloat(tooltip.style.left) >= 0, "help stays inside the viewport");

    // Other application help remains pointer-transparent and dismisses cleanly.
    doc.emit("pointerout", { target: filter, relatedTarget: null });
    assert.equal(doc.body.children.length, 4);
    assert.equal(filter.getAttribute("aria-describedby"), "filter-help");

    doc.activeElement = filter;
    doc.emit("focusin", { target: filter });
    const escape = doc.emit("keydown", { key: "Escape" });
    assert.equal(escape.defaultPrevented, undefined, "global tooltip does not consume Escape");
    assert.equal(escape.stopped, undefined);
    assert.equal(doc.activeElement, filter);
    assert.equal(filter.getAttribute("aria-describedby"), "filter-help");
    assert.equal(doc.body.children.length, 4);

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
    assert.equal(doc.body.children.length, 4, "framework-owned map chrome is not retargeted");

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

    const dashboardFilter = doc.body.appendChild(new Element("select"));
    dashboardFilter.className = "pc-dashboard-filter__control";
    dashboardFilter.setAttribute("aria-label", "Status filter");
    const pageSize = doc.body.appendChild(new Element("select"));
    pageSize.className = "pc-dashboard-page-size__select";
    pageSize.setAttribute("aria-label", "Rows per page");
    const dashboardName = doc.body.appendChild(new Element("td"));
    dashboardName.className = "pc-dashboard-activity-table__product";
    dashboardName.setAttribute("title", "Product name");
    const reviewName = doc.body.appendChild(new Element("span"));
    reviewName.className = "pc-review-product-list__item-name";
    reviewName.setAttribute("title", "Product name");
    const reviewLabel = doc.body.appendChild(new Element("label"));
    reviewLabel.className = "pc-review-product-list__content-type";
    reviewLabel.setAttribute("title", "Show History");
    const reviewCheckbox = reviewLabel.appendChild(new Element("input"));
    reviewCheckbox.setAttribute("aria-label", "History for Product name");
    applyGlobalHelpTooltips(doc);
    for (const target of [
      dashboardFilter,
      pageSize,
      dashboardName,
      reviewName,
      reviewLabel,
      reviewCheckbox,
    ]) {
      doc.emit("pointerover", { target });
      assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 0);
    }
    for (const target of [dashboardName, reviewName, reviewLabel]) {
      assert.equal(target.getAttribute("title"), null);
    }
    assert.equal(reviewCheckbox.getAttribute("aria-label"), "History for Product name");

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

    doc.body.setAttribute("data-pc-onboarding-active", "");
    doc.emit("pc-onboarding-start");
    assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 0);
    assert.equal(popup.getAttribute("aria-describedby"), null);
    popupHelp.show();
    assert.equal(doc.body.querySelectorAll(".pc-help-tooltip").length, 0);
    doc.body.removeAttribute("data-pc-onboarding-active");
    popupHelp.show();
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
