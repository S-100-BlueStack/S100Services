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
    this.dataset = {};
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
  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
}

async function createHarness() {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  return runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") +
      `\n({ createDashboardGrid, createSummaryCards, createDistributionOverview, createActivityTrendPanel, createSpecificationBreakdown, createOperationalHealthOverview, createReportSummaryOverview, createDistributionTrendPanel, createAdditionalInsightsOverview, hasAdditionalDashboardInsights });`,
    {
      document: { createElement: (tagName) => new Element(tagName) },
      createDefaultDashboardFilters: () => ({}),
      normalizeDashboardFilters: (filters) => filters,
      hasActiveDashboardFilters: () => false,
      isDashboardSummaryRowFilterActive: () => false,
    }
  );
}

test("IC-ENC counters show recorded outcomes without claiming verified external delivery", async () => {
  const { createDistributionOverview } = await createHarness();
  const panel = createDistributionOverview({
    live: { sent: 0, accepted: 0, rejected: 0, pending: 0, acceptanceRatePercent: null },
    simulation: { sent: 2, accepted: 2, rejected: 0, pending: 0, acceptanceRatePercent: 100 },
    bySpecification: [
      { specification: "S101", isSimulation: true, counts: { accepted: 1 } },
      { specification: "S57", isSimulation: true, counts: { accepted: 1 } },
    ],
  });
  assert.equal(panel.children[0].children[0].textContent, "IC-ENC distribution");
  assert.equal(panel.children[0].children[1].textContent, "100% distributed");
  assert.deepEqual(
    Array.from(panel.children[1].children, (counter) => counter.children[1].textContent),
    ["2", "2", "0", "0"]
  );
  assert.equal(
    panel.children.length,
    2,
    "The summary must not contain redundant notes or provenance text"
  );
});

test("Distribution counters stay unavailable when neither backend source supplied a value", async () => {
  const { createDistributionOverview } = await createHarness();
  const panel = createDistributionOverview({ live: null, simulation: null });
  assert.deepEqual(
    Array.from(panel.children[1].children, (counter) => counter.children[1].textContent),
    ["—", "—", "—", "—"]
  );
  assert.equal(panel.children[0].children[1].textContent, "");
});

test("IC-ENC summaries add backend sources without averaging their acceptance rates", async () => {
  const { createDistributionOverview } = await createHarness();
  const panel = createDistributionOverview({
    live: { sent: 10, accepted: 3, rejected: 1, pending: 6 },
    simulation: { sent: 2, accepted: 1, rejected: 1, pending: 0 },
  });
  assert.deepEqual(
    Array.from(panel.children[1].children, (counter) => counter.children[1].textContent),
    ["12", "4", "2", "6"]
  );
  assert.equal(panel.children[0].children[1].textContent, "67% distributed");
});

test("An acceptance percentage is not inferred when a decision count is missing", async () => {
  const { createDistributionOverview } = await createHarness();
  const panel = createDistributionOverview({ live: { sent: 3, accepted: 1 }, simulation: null });
  assert.equal(panel.children[0].children[1].textContent, "");
  assert.equal(panel.children[1].children[1].children[1].textContent, "1");
  assert.equal(panel.children[1].children[2].children[1].textContent, "—");
});

test("Daily chart uses complete backend trend buckets and preserves exact failed counts", async () => {
  const { createActivityTrendPanel } = await createHarness();
  const panel = createActivityTrendPanel([
    { day: "2026-11-13", activities: 80, failed: 2, important: 2 },
  ]);
  assert.equal(panel.children[0].children[0].textContent, "Activity over time");
  assert.equal(panel.children[0].children[1].textContent, "80 events");
  const plot = panel.children[1].children[0];
  assert.equal(plot.attributes.get("role"), "img");
  assert.match(plot.attributes.get("aria-label"), /13\/11-2026: Activities 80, Failed events 2/);
  assert.equal(plot.children.length, 1);
  assert.equal(panel.children[1].classList.contains("is-sparse"), true);
  assert.equal(plot.children[0].title, "13/11-2026: Activities 80, Failed events 2");
  assert.equal(plot.children[0].children[1].textContent, "13/11");
  assert.equal(plot.children[0].children[0].children[0].attributes.get("data-value"), "80");
  assert.equal(plot.children[0].children[0].children[0].style.height, "100%");
  assert.equal(plot.children[0].children[0].children[1].style.height, "3%");
});

test("Long daily trends limit chart density without changing totals", async () => {
  const { createActivityTrendPanel } = await createHarness();
  const rows = Array.from({ length: 20 }, (_, index) => ({
    day: `2026-11-${String(index + 1).padStart(2, "0")}`,
    activities: 1,
    failed: 0,
  }));
  const panel = createActivityTrendPanel(rows);
  assert.equal(panel.children[0].children[1].textContent, "20 events");
  assert.equal(panel.children[1].children[0].children.length, 14);
  assert.match(panel.children[1].children[2].textContent, /latest 14 days/);
  assert.equal(panel.children[1].classList.contains("is-sparse"), false);
  assert.equal(panel.children[1].children[0].children[0].children[1].textContent, "07/11");
});

test("Breakdown, health, report totals and live distribution trend retain their separate scopes", async () => {
  const h = await createHarness();
  const specifications = h.createSpecificationBreakdown([
    { specification: "S101", activities: 40, productsTouched: 6, failed: 2 },
    { specification: "S57", activities: 40, productsTouched: 6, failed: 0 },
  ]);
  assert.equal(specifications.children[1].children.length, 2);
  assert.equal(specifications.children[1].children[0].children[1].children[0].style.width, "50%");

  const health = h.createOperationalHealthOverview({
    tracks: 12,
    processing: 0,
    awaitingIcEnc: 0,
    paused: 0,
  });
  assert.equal(health.children[0].children[1].textContent, "12 tracks");
  assert.equal(health.children[1].children[0].children[0].textContent, "Export / validate");
  assert.equal(health.children[1].children[1].children[0].textContent, "At IC-ENC");

  const reports = h.createReportSummaryOverview({
    total: 16,
    icEnc: 2,
    internalValidation: 0,
    validationDiagnostics: 14,
  });
  assert.equal(reports.children[1].children[0].children[1].textContent, "2");
  assert.equal(reports.children[1].children.length, 2);
  assert.equal(reports.children[1].children[1].children[0].textContent, "Validation files");
  assert.equal(reports.children[1].children[1].children[1].textContent, "14");

  const trend = h.createDistributionTrendPanel([
    { day: "2026-11-15", sent: 1, accepted: 0, rejected: 0 },
  ]);
  assert.match(
    trend.children[1].children[0].attributes.get("aria-label"),
    /15\/11-2026: Sent 1, Distributed 0, Rejected 0/
  );
});

test("Additional insights combine specification, current workflow and report-file counters", async () => {
  const { createAdditionalInsightsOverview, hasAdditionalDashboardInsights } =
    await createHarness();
  const dashboard = {
    productBreakdown: [
      { specification: "S101", activities: 50, productsTouched: 6, failed: 2 },
      { specification: "S57", activities: 50, productsTouched: 6, failed: 0 },
    ],
    operationalHealth: { tracks: 12, openErrors: 0, processing: 0, awaitingIcEnc: 0, paused: 0 },
    reportSummary: { total: 16, icEnc: 2, internalValidation: 0, validationDiagnostics: 14 },
    activityTrend: [{ day: "2026-11-17", activities: 100, failed: 2 }],
  };
  assert.equal(hasAdditionalDashboardInsights(dashboard), true);
  const panel = createAdditionalInsightsOverview(dashboard);
  assert.equal(panel.children[0].children[0].textContent, "Additional insights");
  assert.equal(
    panel.children.length,
    2,
    "Additional insights only renders its three compact cards"
  );
  const insights = panel.children[1];
  assert.equal(insights.className, "pc-dashboard-insights");
  assert.equal(insights.children.length, 3);
  assert.deepEqual(
    Array.from(insights.children, (item) => item.children[0].children[0].textContent),
    ["Activity by specification", "Current workflow state", "Stored report files"]
  );
  assert.ok(insights.children.every((item) => item.children[0].children[0].tagName === "h3"));
  assert.equal(
    insights.children[0].children[1].children[0].children[0].children[1].textContent,
    "50 events"
  );
  assert.equal(insights.children[1].children[1].children[0].children[1].textContent, "0");
  assert.equal(insights.children[2].children[1].children[0].children[1].textContent, "2");
  assert.equal(insights.children[2].children[1].children.length, 2);
  assert.equal(insights.children[2].children[1].children[1].children[1].textContent, "14");
});

test("A one-day activity trend stays visible and multi-day distribution remains secondary", async () => {
  const { createActivityTrendPanel, hasAdditionalDashboardInsights } = await createHarness();
  const panel = createActivityTrendPanel(
    [{ day: "2026-11-13", activities: 80, failed: 2 }],
    [{ day: "2026-11-13", sent: 1, accepted: 1, rejected: 0 }]
  );
  assert.equal(panel.children[0].children[0].textContent, "Activity over time");
  assert.equal(panel.children[1].children[0].attributes.get("role"), "img");
  assert.match(
    panel.children[1].children[0].attributes.get("aria-label"),
    /Activities 80, Failed events 2/
  );
  const details = panel.children[2];
  assert.equal(details.tagName, "details");
  assert.equal(details.children[0].textContent, "Distribution over time");
  assert.equal(details.open, false);
  assert.match(
    details.children[1].children[1].children[0].attributes.get("aria-label"),
    /Sent 1, Distributed 1/
  );
  assert.equal(
    hasAdditionalDashboardInsights({ activityTrend: [{ day: "2026-11-13", activities: 1 }] }),
    false
  );
});

test("Five product specifications remain readable without inventing Package-level totals", async () => {
  const { createSpecificationBreakdown } = await createHarness();
  const panel = createSpecificationBreakdown(
    [
      { specification: "S101", activities: 25, productsTouched: 3, failed: 1 },
      { specification: "S57", activities: 20, productsTouched: 3, failed: 0 },
      { specification: "S102", activities: 18, productsTouched: 2, failed: 0 },
      { specification: "S104", activities: 12, productsTouched: 2, failed: 1 },
      { specification: "S111", activities: 5, productsTouched: 1, failed: 0 },
    ],
    { compact: true }
  );
  assert.equal(panel.children[1].children.length, 5);
  assert.deepEqual(
    Array.from(panel.children[1].children, (row) => row.children[0].children[0].textContent),
    ["S-101", "S-57", "S-102", "S-104", "S-111"]
  );
  assert.deepEqual(
    Array.from(panel.children[1].children, (row) => row.children[1].children[0].className),
    ["is-series-0", "is-series-1", "is-series-2", "is-series-3", "is-series-4"]
  );
  assert.equal(panel.children[0].children[1].textContent, "80 events");
});

test("Validation report metric combines internal reports and diagnostics without counting missing data as zero", async () => {
  const { createReportSummaryOverview } = await createHarness();
  const combined = createReportSummaryOverview({
    total: 20,
    icEnc: 4,
    internalValidation: 3,
    validationDiagnostics: 13,
  });
  assert.equal(combined.children[1].children[1].children[1].textContent, "16");
  const unavailable = createReportSummaryOverview({ total: 4, icEnc: 4 });
  assert.equal(unavailable.children[1].children[1].children[1].textContent, "—");
});
