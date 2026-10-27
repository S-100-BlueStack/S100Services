import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addProductCollectionProduct,
  clearProductCollection,
  reconcileProductCollectionSourceProducts,
  removeProductCollectionProduct,
  removeProductCollectionProductsBySource,
} from "../state/productCollectionStore.js";
import { initProductCollectionTray } from "./productCollectionTray.js";

function installDocument(t) {
  const originalDocument = globalThis.document;
  const document = { activeElement: null };

  class Element {
    children = [];
    dataset = {};
    attributes = {};
    listeners = {};
    parentElement = null;
    hidden = false;
    disabled = false;
    className = "";
    tagName;

    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
    }

    get isConnected() {
      return this === document.body || Boolean(this.parentElement?.isConnected);
    }

    get tabIndex() {
      if ("tabindex" in this.attributes) return Number(this.attributes.tabindex);
      return this.tagName === "BUTTON" || this.tagName === "INPUT" ? 0 : -1;
    }

    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this;
        this.children.push(node);
      }
    }

    appendChild(child) {
      this.append(child);
      return child;
    }

    replaceChildren(...nodes) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      this.append(...nodes);
      if (document.redirectFocusOnReplace) {
        document.activeElement = document.redirectFocusOnReplace;
      } else if (!document.activeElement?.isConnected) {
        document.activeElement = document.body;
      }
    }

    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    hasAttribute(name) {
      return name in this.attributes;
    }

    addEventListener(name, handler) {
      this.listeners[name] = handler;
    }

    contains(node) {
      for (let current = node; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    }

    closest(selector) {
      if (selector !== "[hidden]") throw new Error(`Unexpected selector: ${selector}`);
      for (let current = this; current; current = current.parentElement) {
        if (current.hidden) return current;
      }
      return null;
    }

    querySelectorAll(selector) {
      const matches = [];
      const className = selector.startsWith(".") ? selector.slice(1) : null;
      if (!className) throw new Error(`Unexpected selector: ${selector}`);
      function visit(parent) {
        for (const child of parent.children) {
          if (child.className.split(/\s+/).includes(className)) matches.push(child);
          visit(child);
        }
      }
      visit(this);
      return matches;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }

    focus() {
      if (!this.isConnected || this.disabled || this.closest("[hidden]")) {
        throw new Error("Attempted to focus a detached or unavailable control");
      }
      document.activeElement = this;
      this.listeners.focus?.();
    }

    click() {
      if (!this.disabled) this.listeners.click?.();
    }
  }

  document.createElement = (tagName) => new Element(tagName);
  document.body = new Element("body");
  document.activeElement = document.body;
  globalThis.document = document;
  clearProductCollection();
  t.after(() => {
    clearProductCollection();
    globalThis.document = originalDocument;
  });

  const popupButton = document.body.appendChild(document.createElement("button"));
  const searchInput = document.body.appendChild(document.createElement("input"));
  let searchDropdownOpens = 0;
  searchInput.addEventListener("focus", () => {
    searchDropdownOpens += 1;
  });
  const mapSurface = document.body.appendChild(document.createElement("div"));
  const externalInput = document.body.appendChild(document.createElement("input"));
  const tray = initProductCollectionTray({
    root: document.body,
    getFallbackFocusTargets: () => [popupButton, mapSurface],
  });
  t.after(() => tray.destroy());

  function removeButtons() {
    return tray.element.querySelectorAll(".pc-product-collection-tray__remove-button");
  }
  function action(destination) {
    return tray.element
      .querySelectorAll(".pc-product-collection-tray__action")
      .find((button) => button.dataset.collectionAction === destination);
  }

  return {
    document,
    tray: tray.element,
    popupButton,
    searchInput,
    get searchDropdownOpens() {
      return searchDropdownOpens;
    },
    mapSurface,
    externalInput,
    removeButtons,
    action,
  };
}

function product(sourceId, name, capabilities = { analyze: true, review: true }) {
  return {
    sourceId,
    productKey: name,
    datasetName: name,
    productType: "test-product",
    capabilities,
  };
}

test("keyboard Remove moves to the next surviving Product, then the previous one", (t) => {
  const ui = installDocument(t);
  const a = addProductCollectionProduct(product("s101", "A")).item;
  const b = addProductCollectionProduct(product("s101", "B")).item;
  addProductCollectionProduct(product("s101", "C"));

  ui.removeButtons()[1].focus();
  ui.document.activeElement.click();
  assert.equal(ui.removeButtons().length, 2);
  assert.equal(ui.document.activeElement, ui.removeButtons()[1]);
  assert.match(ui.document.activeElement.title, /Remove C/);

  ui.document.activeElement.click();
  assert.equal(ui.document.activeElement, ui.removeButtons()[0]);
  assert.equal(ui.removeButtons()[0].dataset.collectionRemoveId, a.id);
  assert.notEqual(ui.removeButtons()[0].dataset.collectionRemoveId, b.id);
});

test("a source prune retains the precise focused Product identity even with duplicate names", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "SAME"));
  const another = addProductCollectionProduct(product("paper-charts", "SAME")).item;
  ui.removeButtons()[1].focus();
  removeProductCollectionProductsBySource("s101");
  assert.equal(ui.document.activeElement, ui.removeButtons()[0]);
  assert.equal(ui.document.activeElement.dataset.collectionRemoveId, another.id);
});

test("background reconciliation preserves a focused enabled Review control", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  addProductCollectionProduct(product("s101", "B"));
  ui.action("review").focus();
  reconcileProductCollectionSourceProducts("s101", [product("s101", "A")]);
  assert.equal(ui.document.activeElement, ui.action("review"));
  assert.equal(ui.document.activeElement.disabled, false);
});

test("a newly disabled Review action yields focus to Clear without bypassing permissions", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A", { analyze: true, review: false }));
  ui.action("analyze").focus();
  addProductCollectionProduct(product("s101", "B", { analyze: false, review: false }));
  assert.equal(ui.action("analyze").disabled, true);
  assert.equal(ui.action("review").disabled, true);
  assert.equal(
    ui.document.activeElement,
    ui.tray.querySelector(".pc-product-collection-tray__clear-button")
  );
});

test("Clear of a nonempty Collection focuses a visible control outside its hidden tray", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  const clear = ui.tray.querySelector(".pc-product-collection-tray__clear-button");
  clear.focus();
  clear.click();
  assert.equal(ui.tray.hidden, true);
  assert.equal(ui.document.activeElement, ui.popupButton);
  assert.equal(ui.tray.contains(ui.document.activeElement), false);
});

test("Clear returns focus to the map without opening Product search when popup is unavailable", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  ui.popupButton.hidden = true;
  const clear = ui.tray.querySelector(".pc-product-collection-tray__clear-button");
  clear.focus();
  clear.click();
  assert.equal(ui.tray.hidden, true);
  assert.equal(ui.document.activeElement, ui.mapSurface);
  assert.equal(ui.searchDropdownOpens, 0);
  assert.equal(ui.tray.contains(ui.document.activeElement), false);
});

test("last Remove falls back to the map without opening Product search", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  ui.popupButton.hidden = true;
  ui.removeButtons()[0].focus();
  ui.document.activeElement.click();
  assert.equal(ui.tray.hidden, true);
  assert.equal(ui.document.activeElement, ui.mapSurface);
  assert.equal(ui.searchDropdownOpens, 0);
  assert.equal(ui.mapSurface.getAttribute("tabindex"), "-1");
  assert.equal(ui.mapSurface.dataset.collectionFocusFallback, "");
});

test("a source update cannot steal focus from an unrelated input", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  ui.externalInput.focus();
  removeProductCollectionProductsBySource("s101");
  assert.equal(ui.document.activeElement, ui.externalInput);
});

test("a focused surviving Remove button follows its identity when an earlier item disappears", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  addProductCollectionProduct(product("paper-charts", "B"));
  const last = addProductCollectionProduct(product("s101", "C")).item;
  ui.removeButtons()[2].focus();
  removeProductCollectionProduct(product("paper-charts", "B"));
  assert.equal(ui.document.activeElement, ui.removeButtons()[1]);
  assert.equal(ui.document.activeElement.dataset.collectionRemoveId, last.id);
});

test("synchronous focus movement to another control is never overridden by a tray rerender", (t) => {
  const ui = installDocument(t);
  addProductCollectionProduct(product("s101", "A"));
  ui.removeButtons()[0].focus();
  ui.document.redirectFocusOnReplace = ui.externalInput;
  addProductCollectionProduct(product("s101", "B"));
  assert.equal(ui.document.activeElement, ui.externalInput);
});
