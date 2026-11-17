import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.listeners = new Map();
    this.classes = new Set();
    this.style = {};
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

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

async function createHarness() {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const events = [];
  const document = {
    createElement: (tagName) => new Element(tagName),
    dispatchEvent: (event) => events.push(event),
  };
  return runInNewContext(
    source.replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "").replace("export function", "function") +
      `\ncreateActivityFilterBar = () => document.createElement("form");
      createActivityTable = () => document.createElement("table");
      createActivityPagination = () => document.createElement("footer");
      ({ createSummaryCards, createActivityList, createDashboardGrid, events });`,
    {
      document,
      events,
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
      createDefaultDashboardFilters: () => ({}),
      normalizeDashboardFilters: (filters) => filters,
      hasActiveDashboardFilters: () => false,
    }
  );
}

test("Dashboard KPI cards distinguish backend totals from the unavailable distribution acceptance metric", async () => {
  const { createSummaryCards } = await createHarness();
  const section = createSummaryCards({
    summary: {
      totalActivities: 42,
      productsTouched: 18,
      importantChanges: 6,
      reportsAvailable: 9,
      failedOperations: 2,
    },
    statusSummary: [{ label: "active", count: 12 }],
  });

  assert.equal(section.attributes.get("aria-label"), "Dashboard summary");
  assert.equal(section.children.length, 6);
  assert.deepEqual(
    Array.from(section.children, (card) => card.children[0].textContent),
    ["Activities", "Products touched", "Active", "Accepted for distribution", "Failed", "Reports"]
  );
  assert.deepEqual(
    Array.from(section.children, (card) => card.children[1].textContent),
    ["42", "18", "12", "—", "2", "9"]
  );
  assert.equal(section.children[0].children[2].textContent, "6 important changes");
  assert.equal(section.children[3].children[2].textContent, "Backend total not available");
  assert.equal(section.children[3].classList.contains("is-unavailable"), true);
  assert.ok(section.children.every((card) => card.children[3].className === "pc-dashboard-visually-hidden"));
  assert.ok(section.children.every((card) => card.children[3].textContent.length > 0));
});

test("Ready for distribution is never misreported as an Accepted for distribution KPI", async () => {
  const { createSummaryCards } = await createHarness();
  const section = createSummaryCards({
    summary: { totalActivities: 80, failedOperations: 2 },
    statusSummary: [
      { label: "completed", count: 18 },
      { label: "active", count: 44 },
      { label: "ready for distribution", count: 12 },
    ],
  });
  assert.equal(section.children[2].children[1].textContent, "44");
  assert.equal(section.children[3].children[1].textContent, "—");
});

test("Activity list exposes its heading and retains the count and filter/table/footer structure", async () => {
  const { createActivityList } = await createHarness();
  const section = createActivityList([], false, null, {
    filters: {},
    filterOptions: { types: [], statuses: [], products: [] },
    sourceActivityCount: 14,
    paging: {},
    pageSize: 50,
    pageNumber: 1,
    canGoPrevious: false,
    sortBy: "time",
    sortDirection: "desc",
    pagingMatchesPageSize: true,
  });

  const header = section.children[0];
  assert.equal(header.children[0].tagName, "h2");
  assert.equal(header.children[0].textContent, "Activity list");
  assert.equal(header.children[0].className, "pc-dashboard-panel__title");
  assert.equal(header.children[1].textContent, "0 / 14");
  assert.equal(section.children[1].tagName, "form");
  assert.equal(section.children[2].tagName, "div");
  assert.equal(section.children[3].tagName, "footer");
});


test("Failed KPI is an accessible toggle for the existing server-side failed filter", async () => {
  const { createSummaryCards, events } = await createHarness();
  const section = createSummaryCards({ summary: { failedOperations: 3 } });
  const failed = section.children[4];
  assert.equal(failed.tagName, "button");
  assert.equal(failed.type, "button");
  assert.equal(failed.dataset.dashboardFocusKey, "failed-kpi");
  assert.equal(failed.attributes.get("aria-pressed"), "false");
  failed.click();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "pc-dashboard-filter-change");
  assert.equal(events[0].detail.filters.importance, "failed");
  const rerendered = createSummaryCards({ summary: { failedOperations: 3 } });
  const selected = rerendered.children[4];
  assert.equal(selected.attributes.get("aria-pressed"), "true");
  selected.click();
  assert.equal(events[1].detail.filters.importance, "all");
});

test("Dashboard places compact KPIs with activity in the main column, leaving the side column for charts", async () => {
  const { createDashboardGrid } = await createHarness();
  const grid = createDashboardGrid({
    dashboard: {
      activities: [],
      summary: { totalActivities: 0, failedOperations: 0 },
      statusSummary: [],
      operationSummary: [],
      filterOptions: { types: [], statuses: [], products: [] },
      range: {},
      paging: {},
    },
    sourceActivityCount: 0,
    loading: false,
    filters: {},
    filterOptions: { types: [], statuses: [], products: [] },
    pageSize: 50,
    pageNumber: 1,
    canGoPrevious: false,
    sortBy: "time",
    sortDirection: "desc",
    pagingMatchesPageSize: true,
  });

  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[0].children[0].attributes.get("aria-label"), "Dashboard summary");
  assert.equal(grid.children[0].children[1].className, "pc-dashboard-panel pc-dashboard-activity");
  assert.equal(grid.children[1].children.length, 2);
  assert.equal(grid.children[1].children[0].children[0].children[0].textContent, "Status summary");
  assert.equal(grid.children[1].children[1].children[0].children[0].textContent, "Operation summary");
});
