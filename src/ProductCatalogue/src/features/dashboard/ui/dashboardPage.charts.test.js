import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = "";
    this.className = "";
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains: (name) => this.classes.has(name),
    };
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

async function createHarness() {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const events = [];
  const ui = runInNewContext(
    source.replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "").replace("export function", "function") +
      `\n({ createSummaryRows, createDashboardStatusChart, getDashboardChartTone });`,
    {
      document: {
        createElement: (tagName) => new Element(tagName),
        dispatchEvent: (event) => events.push(event),
      },
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
      createDefaultDashboardFilters: () => ({}),
      isDashboardSummaryRowFilterActive: () => false,
      createDashboardSummaryRowFilterPatch: (_, { filterKey, rowValue }) => ({
        [filterKey]: rowValue,
      }),
      normalizeDashboardFilters: (filters) => filters,
    }
  );
  return { ...ui, events };
}

test("status distribution chart uses full backend totals rather than the visible activity page", async () => {
  const h = await createHarness();
  const rows = [
    { label: "active", count: 44, failed: 0 },
    { label: "completed", count: 18, failed: 0 },
    { label: "failed", count: 2, failed: 2 },
    { label: "idle", count: 16, failed: 0 },
  ];
  const panel = h.createSummaryRows({ title: "Status summary", rows, filterKey: "status", filters: {} });
  assert.equal(panel.children.length, 2);
  assert.equal(panel.children[0].children[1].textContent, "80");
  const overview = panel.children[1];
  const chart = overview.children[0];
  assert.equal(chart.attributes.get("role"), "img");
  assert.match(chart.attributes.get("aria-label"), /Active 44/);
  assert.match(chart.style.background, /conic-gradient\(/);
  assert.match(chart.style.background, /55\.000%/);
  assert.equal(chart.children[0].children[0].textContent, "80");
  assert.equal(chart.children[0].attributes.get("aria-hidden"), "true");
  const legend = overview.children[1];
  assert.deepEqual(
    Array.from(legend.children, (item) => item.children[0].className.split("is-")[1]),
    ["active", "positive", "danger", "neutral"]
  );
  legend.children[0].click();
  assert.equal(h.events[0].type, "pc-dashboard-filter-change");
  assert.equal(h.events[0].detail.filters.status, "active");
});

test("operation bars show relative server counts and retain click-to-filter behavior", async () => {
  const h = await createHarness();
  const panel = h.createSummaryRows({
    title: "Operation summary",
    rows: [
      { label: "export", count: 26, failed: 0 },
      { label: "validation", count: 13, failed: 2 },
      { label: "send", count: 0, failed: 0 },
    ],
    filterKey: "type",
    filters: {},
  });
  assert.equal(panel.children.length, 2);
  const rows = panel.children[1].children;
  assert.deepEqual(Array.from(rows, (row) => row.children[1].children[0].style.height), [
    "100%",
    "50%",
    "0%",
  ]);
  assert.equal(rows[1].children[0].textContent, "13 (2 failed)");
  assert.equal(rows[1].children[2].textContent, "Validation");
  rows[1].click();
  assert.equal(h.events[0].detail.filters.type, "validation");
});

test("status tones are limited to verified semantic statuses and other values remain neutral", async () => {
  const h = await createHarness();
  assert.equal(h.getDashboardChartTone("ReadyForDistribution", "status"), "neutral");
  assert.equal(h.getDashboardChartTone("failed", "status"), "danger");
  assert.equal(h.getDashboardChartTone("completed", "status"), "positive");
  assert.equal(h.getDashboardChartTone("export", "type"), "export");
  assert.equal(h.getDashboardChartTone("validation", "type"), "validation");
  assert.equal(h.getDashboardChartTone("unknown", "type"), "neutral");
});
