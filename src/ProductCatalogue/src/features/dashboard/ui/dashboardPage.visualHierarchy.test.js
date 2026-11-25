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
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") +
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
      isDashboardSummaryRowFilterActive: () => false,
    }
  );
}

function getSummaryCards(section) {
  return section.children.map((element) =>
    element.className === "pc-dashboard-summary-card-slot" ? element.children[0] : element
  );
}

test("Dashboard KPI cards retain semantic labels without redundant tooltip subtitles", async () => {
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
  const cards = getSummaryCards(section);
  assert.deepEqual(
    Array.from(cards, (card) => card.children[0].textContent),
    ["Activities", "Products touched", "Open errors", "Distributed", "Failed events", "Reports"]
  );
  assert.deepEqual(
    Array.from(cards, (card) => card.children[1].textContent),
    ["42", "18", "—", "—", "2", "9"]
  );
  assert.equal(cards[3].classList.contains("is-unavailable"), true);
  assert.ok(cards.every((card) => card.children.length === 3));
  assert.ok(cards.every((card) => card.children[2].className === "pc-dashboard-visually-hidden"));
  assert.ok(cards.every((card) => card.children[2].textContent.length > 0));
  assert.ok(cards.every((card) => card.title === undefined));
});

test("Ready for distribution is never misreported as a Distributed KPI", async () => {
  const { createSummaryCards } = await createHarness();
  const section = createSummaryCards({
    summary: { totalActivities: 80, failedOperations: 2 },
    statusSummary: [
      { label: "completed", count: 18 },
      { label: "active", count: 44 },
      { label: "ready for distribution", count: 12 },
    ],
  });
  assert.equal(getSummaryCards(section)[2].children[1].textContent, "—");
  assert.equal(section.children[3].children[1].textContent, "—");
});

test("Dashboard KPI counts recorded accepted revisions without changing backend provenance", async () => {
  const { createSummaryCards } = await createHarness();
  const cards = createSummaryCards({
    summary: { totalActivities: 80, failedOperations: 2, reportsAvailable: 16 },
    distribution: {
      live: { sent: 0, accepted: 0, rejected: 0, pending: 0, acceptanceRatePercent: null },
      simulation: { sent: 2, accepted: 2, rejected: 0, pending: 0, acceptanceRatePercent: 100 },
    },
    operationalHealth: { openErrors: 1, tracks: 12 },
    reportSummary: { total: 16, icEnc: 2, validationDiagnostics: 14 },
  });
  assert.equal(getSummaryCards(cards)[2].children[1].textContent, "1");
  assert.equal(cards.children[3].children[1].textContent, "2");
  assert.equal(cards.children[3].children[2].className, "pc-dashboard-visually-hidden");
  assert.equal(cards.children[3].classList.contains("is-unavailable"), false);
  assert.equal(getSummaryCards(cards)[4].children[1].textContent, "2");
  assert.equal(cards.children[5].children[2].className, "pc-dashboard-visually-hidden");
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
  const failed = getSummaryCards(section)[4];
  const help = section.children[4].children[1];
  assert.equal(help.tagName, "button");
  assert.equal(help.attributes.get("aria-label"), "About Failed events");
  help.click();
  assert.equal(events.length, 0, "Help is a separate action, not a filter toggle");
  assert.equal(failed.tagName, "button");
  assert.equal(failed.type, "button");
  assert.equal(failed.dataset.dashboardFocusKey, "failed-kpi");
  assert.equal(failed.attributes.get("aria-pressed"), "false");
  assert.match(failed.attributes.get("aria-label"), /Filter to failed activity/);
  assert.equal(failed.title, undefined);
  failed.click();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "pc-dashboard-filter-change");
  assert.equal(events[0].detail.filters.importance, "failed");
  const rerendered = createSummaryCards({ summary: { failedOperations: 3 } });
  const selected = getSummaryCards(rerendered)[4];
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
  assert.equal(grid.children[1].children.length, 1);
  const summaryRow = grid.children[1].children[0];
  assert.equal(summaryRow.className, "pc-dashboard-overview-row");
  assert.equal(summaryRow.children[0].children[0].children[0].textContent, "Status summary");
  assert.equal(summaryRow.children[1].children[0].children[0].textContent, "Operation summary");
});

test("Dashboard reporting has requested chart hierarchy and an always-visible one-day timeline", async () => {
  const { createDashboardGrid } = await createHarness();
  const grid = createDashboardGrid({
    dashboard: {
      activities: [],
      summary: { totalActivities: 100 },
      distribution: {
        live: { sent: 0, accepted: 0, rejected: 0, pending: 0, acceptanceRatePercent: null },
        simulation: { sent: 2, accepted: 2 },
      },
      activityTrend: [{ day: "2026-11-17", activities: 100, failed: 2 }],
      productBreakdown: [
        { specification: "S101", activities: 50, productsTouched: 6, failed: 2 },
        { specification: "S57", activities: 50, productsTouched: 6, failed: 0 },
      ],
      operationalHealth: { tracks: 12, processing: 0, awaitingIcEnc: 0, paused: 0 },
      reportSummary: { total: 16, icEnc: 2, internalValidation: 0, validationDiagnostics: 14 },
      statusSummary: [{ label: "completed", count: 20 }],
      operationSummary: [{ label: "export", count: 20, failed: 0 }],
      filterOptions: { types: [], statuses: [], products: [] },
      range: {},
      paging: {},
    },
    sourceActivityCount: 100,
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
  const aside = grid.children[1];
  assert.equal(aside.children.length, 4);
  assert.equal(aside.children[0].className, "pc-dashboard-overview-row");
  assert.deepEqual(
    Array.from(aside.children[0].children, (panel) => panel.children[0].children[0].textContent),
    ["Status summary", "Operation summary"]
  );
  assert.deepEqual(
    Array.from(aside.children.slice(1), (panel) => panel.children[0].children[0].textContent),
    ["IC-ENC distribution", "Activity over time", "Additional insights"]
  );
  assert.equal(aside.children[2].children[1].children[0].children.length, 1);
  assert.equal(aside.children[3].children[1].children.length, 3);
  assert.equal(aside.children[3].children.length, 2);
});

function findMetricHelp(element) {
  return [
    ...(element.className === "pc-dashboard-metric-help" ? [element] : []),
    ...element.children.flatMap(findMetricHelp),
  ];
}

test("Only the six reporting metrics with non-obvious scopes expose explicit help", async () => {
  const { createDashboardGrid } = await createHarness();
  const grid = createDashboardGrid({
    dashboard: {
      activities: [],
      summary: { totalActivities: 100, failedOperations: 2 },
      distribution: { live: { accepted: 1, rejected: 0 } },
      productBreakdown: [],
      operationalHealth: { tracks: 12 },
      reportSummary: { total: 16 },
      activityTrend: [],
      statusSummary: [],
      operationSummary: [],
      range: {},
      paging: {},
    },
    sourceActivityCount: 100,
    filters: {},
    filterOptions: { types: [], statuses: [], products: [] },
    pageSize: 50,
    pageNumber: 1,
  });
  const buttons = findMetricHelp(grid);
  assert.deepEqual(
    Array.from(buttons, (button) => button.attributes.get("aria-label")),
    [
      "About Open errors",
      "About Failed events",
      "About IC-ENC distribution",
      "About Activity by specification",
      "About Current workflow state",
      "About Stored report files",
    ]
  );
  assert.equal(new Set(buttons.map((button) => button.dataset.dashboardFocusKey)).size, 6);
  for (const button of buttons) {
    assert.equal(button.tagName, "button");
    assert.equal(button.type, "button");
    assert.equal(button.attributes.has("data-app-help-on-click"), true);
    assert.ok(button.attributes.get("data-app-original-title").length > 30);
    assert.equal(button.attributes.has("title"), false);
    assert.equal(button.children[0].tagName, "calcite-icon");
    assert.equal(button.children[0].attributes.get("aria-hidden"), "true");
  }
  const explanations = Array.from(buttons, (button) =>
    button.attributes.get("data-app-original-title")
  );
  assert.match(explanations[0], /currently in Error or Rejected/);
  assert.match(explanations[1], /Historical failed events/);
  assert.match(explanations[2], /Pending is excluded/);
  assert.match(explanations[3], /Package members are counted separately/);
  assert.match(explanations[4], /independent of the date range/);
  assert.match(explanations[5], /not validation runs/);
});
