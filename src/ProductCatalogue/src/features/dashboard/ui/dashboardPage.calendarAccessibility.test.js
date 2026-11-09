import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

async function createDatePickerHarness({
  viewDate = "2026-11-09",
  selectedDate = "2026-11-09",
} = {}) {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const document = { activeElement: null };

  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.className = "";
      this.textContent = "";
      this.dataset = {};
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.parentElement = null;
      this.classList = {
        toggle: (name, enabled) => {
          this.classes = this.classes ?? new Set();
          if (enabled) {
            this.classes.add(name);
          } else {
            this.classes.delete(name);
          }
        },
      };
    }

    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
    }

    appendChild(child) {
      this.append(child);
      return child;
    }

    querySelector(selector) {
      const className = selector.startsWith(".") ? selector.slice(1) : null;
      for (const child of this.children) {
        if (className && child.className.split(/\s+/).includes(className)) {
          return child;
        }
        const descendant = child.querySelector(selector);
        if (descendant) {
          return descendant;
        }
      }
      return null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    focus() {
      document.activeElement = this;
    }

    click() {
      this.listeners.get("click")?.();
    }

    remove() {
      const siblings = this.parentElement?.children;
      if (!siblings) {
        return;
      }
      const index = siblings.indexOf(this);
      if (index >= 0) {
        siblings.splice(index, 1);
      }
      this.parentElement = null;
      if (document.activeElement === this) {
        document.activeElement = null;
      }
    }
  }

  document.createElement = (tagName) => new Element(tagName);
  const calendar = runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") + "\n({ renderDashboardDatePickerPanel });",
    { document, createDefaultDashboardFilters: () => ({}) }
  );

  const root = new Element("div");
  root.dataset.viewDate = viewDate;
  const dateButton = new Element("button");
  dateButton.className = "pc-dashboard-range-date-button";
  dateButton.dataset.dateValue = selectedDate;
  const panel = new Element("div");
  root.append(dateButton, panel);
  const onSelect = () => {};
  const onClear = () => {};
  const render = () => calendar.renderDashboardDatePickerPanel({ root, panel, onSelect, onClear });
  return { document, root, panel, dateButton, render };
}

test("Dashboard month navigation retains keyboard focus while updating the month", async () => {
  const h = await createDatePickerHarness();
  h.render();
  const header = h.panel.querySelector(".pc-dashboard-date-picker__header");
  const previous = header.children[0];
  const next = header.children[2];
  next.focus();
  next.click();
  assert.equal(h.document.activeElement, next);
  assert.equal(h.panel.querySelector(".pc-dashboard-date-picker__header"), header);
  assert.equal(header.children[1].textContent, "December 2026");
  next.click();
  assert.equal(h.document.activeElement, next);
  assert.equal(header.children[1].textContent, "January 2027");
  previous.focus();
  previous.click();
  assert.equal(h.document.activeElement, previous);
  assert.equal(header.children[1].textContent, "December 2026");
  assert.equal(header.children[1].attributes.get("aria-live"), "polite");
});

test("Dashboard calendar announces dates and selected and today states", async () => {
  const h = await createDatePickerHarness();
  h.render();
  const days = h.panel.querySelector(".pc-dashboard-date-picker__days").children;
  assert.equal(days.length, 42);
  const selected = days.find((button) => button.dataset.dateValue === "2026-11-09");
  assert.equal(selected.textContent, "9");
  assert.equal(selected.attributes.get("aria-label"), "Monday, 9 November 2026, selected");
  const adjacent = days.find((button) => button.dataset.dateValue === "2026-10-26");
  assert.equal(adjacent.attributes.get("aria-label"), "Monday, 26 October 2026");
  assert.equal(new Set(days.map((button) => button.attributes.get("aria-label"))).size, 42);

  const today = new Date();
  const dateValue = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const current = await createDatePickerHarness({ viewDate: dateValue, selectedDate: "" });
  current.render();
  const currentDay = current.panel
    .querySelector(".pc-dashboard-date-picker__days")
    .children.find((button) => button.dataset.dateValue === dateValue);
  assert.equal(currentDay.attributes.get("aria-current"), "date");
});

test("optional date clearing updates without duplicating calendar controls", async () => {
  const h = await createDatePickerHarness();
  h.render();
  assert.ok(h.panel.querySelector(".pc-dashboard-date-picker__clear"));
  h.dateButton.dataset.dateValue = "";
  h.render();
  assert.equal(h.panel.querySelector(".pc-dashboard-date-picker__clear"), null);
  assert.equal(h.panel.children.length, 3);
  h.render();
  assert.equal(h.panel.children.length, 3);
});
