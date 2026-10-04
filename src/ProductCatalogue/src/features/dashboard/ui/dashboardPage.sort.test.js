import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createDefaultDashboardFilters } from "../domain/dashboardFilters.js";

async function createHeaderHarness() {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const elements = [];
  const events = [];
  const document = {
    activeElement: null,
    createElement(tag) {
      const element = tag === "button" ? new Button(tag) : new Element(tag);
      elements.push(element);
      return element;
    },
    querySelector(selector) {
      const key = selector.match(/data-dashboard-sort-key="([^"]+)"/)?.[1];
      return elements.findLast((element) => element.dataset.dashboardSortKey === key);
    },
    dispatchEvent(event) {
      events.push(event);
    },
  };
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.dataset = {};
      this.attributes = new Map();
      this.children = [];
      this.listeners = new Map();
    }
    append(...children) {
      this.children.push(...children);
    }
    appendChild(child) {
      this.append(child);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    addEventListener(name, handler) {
      this.listeners.set(name, handler);
    }
    focus() {
      document.activeElement = this;
    }
  }
  class Button extends Element {}
  class Input extends Element {}
  class Select extends Element {}
  const ui = runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") +
      "\n({ createActivityTable, captureDashboardControlFocus, restoreDashboardControlFocus });",
    {
      document,
      createDefaultDashboardFilters,
      HTMLButtonElement: Button,
      HTMLInputElement: Input,
      HTMLSelectElement: Select,
      CSS: { escape: (value) => value },
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
    }
  );
  return { ...ui, document, events, source };
}

test("only Time, Product, Activity and Status have native sortable headers and active aria-sort", async () => {
  const h = await createHeaderHarness();
  for (const sortBy of ["time", "product", "activity", "status"]) {
    for (const sortDirection of ["asc", "desc"]) {
      const table = h.createActivityTable([], null, { sortBy, sortDirection });
      const headers = table.children[0].children[0].children;
      assert.equal(headers.length, 5);
      assert.equal(headers.filter((th) => th.hasAttribute("aria-sort")).length, 1);
      for (const [index, key] of ["time", "product", "activity", "status"].entries()) {
        const th = headers[index];
        assert.equal(th.scope, "col");
        const button = th.children[0];
        assert.equal(button.tagName, "button");
        assert.equal(button.type, "button");
        assert.equal(button.dataset.dashboardSortKey, key);
        assert.equal(button.disabled, undefined);
        assert.equal(button.listeners.has("keydown"), false);
        assert.equal(button.children[1].attributes.get("aria-hidden"), "true");
        assert.equal(
          th.attributes.get("aria-sort"),
          key === sortBy ? (sortDirection === "asc" ? "ascending" : "descending") : undefined
        );
        button.listeners.get("click")();
        assert.equal(h.events.at(-1).type, "pc-dashboard-sort-change");
        assert.equal(h.events.at(-1).detail.sortBy, key);
      }
      assert.equal(headers[4].scope, "col");
      assert.equal(headers[4].textContent, "Links");
      assert.equal(headers[4].children.length, 0);
      assert.equal(headers[4].listeners.size, 0);
    }
  }
});

test("sort focus identity survives replacement while respecting subsequent user focus", async () => {
  const h = await createHeaderHarness();
  let table = h.createActivityTable([], null, { sortBy: "time", sortDirection: "desc" });
  const productButton = table.children[0].children[0].children[1].children[0];
  productButton.focus();
  const captured = h.captureDashboardControlFocus();
  assert.equal(captured.sortKey, "product");
  table = h.createActivityTable([], null, { sortBy: "product", sortDirection: "asc" });
  h.restoreDashboardControlFocus(captured);
  const replacement = table.children[0].children[0].children[1].children[0];
  assert.notEqual(replacement, productButton);
  assert.equal(h.document.activeElement, replacement);
  assert.equal(replacement.attributes.get("aria-label"), "Product: sort descending");
  h.document.activeElement = null;
  assert.equal(h.captureDashboardControlFocus(), null);
  assert.match(h.source, /const focusState = captureDashboardControlFocus\(\);/);
  assert.match(h.source, /restoreDashboardControlFocus\(focusState\);/);
});
