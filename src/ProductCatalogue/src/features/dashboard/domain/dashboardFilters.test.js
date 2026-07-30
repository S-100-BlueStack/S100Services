import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDashboardFilterOptions,
  createDashboardSummaryRowFilterPatch,
  createDefaultDashboardFilters,
  createFilteredDashboardView,
  filterDashboardActivities,
  hasActiveDashboardFilters,
  isDashboardSummaryRowFilterActive,
  normalizeDashboardFilters,
} from "./dashboardFilters.js";

const ACTIVITIES = [
  {
    id: "export-failed",
    timestamp: "2026-07-08T10:00:00.000Z",
    datasetName: "101DK0040943E",
    productName: "101DK0040943E",
    type: "export",
    status: "failed",
    severity: "critical",
    title: "Export failed",
    description: "All Edition export failed validation.",
    actor: "DOMAIN\\operator",
    isImportant: true,
    links: {
      icEncReports: [{ id: "icenc-1", available: true }],
      internalValidationReports: [],
    },
    details: [{ label: "Scope", value: "All" }],
  },
  {
    id: "send-completed",
    timestamp: "2026-07-08T09:00:00.000Z",
    datasetName: "101DK0040944E",
    productName: "101DK0040944E",
    type: "send",
    status: "completed",
    severity: "normal",
    title: "Sent to IC-ENC",
    description: "Product was sent successfully.",
    actor: "DOMAIN\\operator",
    isImportant: false,
    links: {
      icEncReports: [],
      internalValidationReports: [],
    },
    details: [],
  },
  {
    id: "validation-warning",
    timestamp: "2026-07-08T08:00:00.000Z",
    datasetName: "101DK0040943E",
    productName: "101DK0040943E",
    type: "validation",
    status: "completed",
    severity: "warning",
    title: "Internal validation completed",
    description: "Validation completed with warnings.",
    actor: "DOMAIN\\validator",
    isImportant: true,
    links: {
      icEncReports: [],
      internalValidationReports: [{ id: "validation-1", available: true }],
    },
    details: [{ label: "Warnings", value: "2" }],
  },
];

describe("dashboardFilters", () => {
  it("returns all activities when filters are empty", () => {
    const result = filterDashboardActivities(ACTIVITIES, createDefaultDashboardFilters());

    assert.equal(result.length, 3);
    assert.equal(hasActiveDashboardFilters(createDefaultDashboardFilters()), false);
  });

  it("filters by search, type, status and product", () => {
    const result = filterDashboardActivities(ACTIVITIES, {
      search: "edition",
      type: "export",
      status: "failed",
      product: "101DK0040943E",
    });

    assert.deepEqual(
      result.map((activity) => activity.id),
      ["export-failed"]
    );
  });

  it("filters by important and failed activity", () => {
    const important = filterDashboardActivities(ACTIVITIES, { importance: "important" });
    const failed = filterDashboardActivities(ACTIVITIES, { importance: "failed" });

    assert.deepEqual(
      important.map((activity) => activity.id),
      ["export-failed", "validation-warning"]
    );
    assert.deepEqual(
      failed.map((activity) => activity.id),
      ["export-failed"]
    );
  });

  it("filters by report availability", () => {
    const anyReport = filterDashboardActivities(ACTIVITIES, { reports: "any" });
    const icEnc = filterDashboardActivities(ACTIVITIES, { reports: "ic-enc" });
    const validation = filterDashboardActivities(ACTIVITIES, {
      reports: "internal-validation",
    });

    assert.deepEqual(
      anyReport.map((activity) => activity.id),
      ["export-failed", "validation-warning"]
    );
    assert.deepEqual(
      icEnc.map((activity) => activity.id),
      ["export-failed"]
    );
    assert.deepEqual(
      validation.map((activity) => activity.id),
      ["validation-warning"]
    );
  });

  it("builds stable filter options and normalizes invalid selected values", () => {
    const options = buildDashboardFilterOptions(ACTIVITIES);
    const normalized = normalizeDashboardFilters(
      {
        search: "  EXPORT  ",
        type: "unknown-type",
        status: "failed",
        product: "missing-product",
      },
      options
    );

    assert.deepEqual(options.types, [
      { value: "export", label: "Export" },
      { value: "send", label: "Send" },
      { value: "validation", label: "Validation" },
    ]);
    assert.equal(normalized.search, "EXPORT");
    assert.equal(normalized.type, "all");
    assert.equal(normalized.status, "failed");
    assert.equal(normalized.product, "all");
    assert.equal(hasActiveDashboardFilters(normalized), true);
  });

  it("creates a filtered dashboard view with derived summary and breakdowns", () => {
    const dashboard = createFilteredDashboardView(
      {
        summary: {
          totalActivities: 99,
          productsTouched: 99,
          importantChanges: 99,
          failedOperations: 99,
          reportsAvailable: 99,
        },
        activities: ACTIVITIES,
      },
      { product: "101DK0040943E" }
    );

    assert.equal(dashboard.activities.length, 2);
    assert.equal(dashboard.summary.totalActivities, 2);
    assert.equal(dashboard.summary.productsTouched, 1);
    assert.equal(dashboard.summary.importantChanges, 2);
    assert.equal(dashboard.summary.failedOperations, 1);
    assert.equal(dashboard.summary.reportsAvailable, 2);
    assert.deepEqual(dashboard.statusSummary, [
      { label: "completed", count: 1, failed: 0 },
      { label: "failed", count: 1, failed: 1 },
    ]);
    assert.deepEqual(dashboard.operationSummary, [
      { label: "export", count: 1, failed: 1 },
      { label: "validation", count: 1, failed: 0 },
    ]);
  });

  it("creates toggle patches for actionable summary rows", () => {
    const statusPatch = createDashboardSummaryRowFilterPatch(createDefaultDashboardFilters(), {
      filterKey: "status",
      rowValue: "Failed",
    });
    const typePatch = createDashboardSummaryRowFilterPatch(
      { type: "export" },
      {
        filterKey: "type",
        rowValue: "export",
      }
    );

    assert.deepEqual(statusPatch, { status: "failed" });
    assert.deepEqual(typePatch, { type: "all" });
    assert.equal(
      isDashboardSummaryRowFilterActive(
        { status: "failed" },
        { filterKey: "status", rowValue: "failed" }
      ),
      true
    );
    assert.equal(
      isDashboardSummaryRowFilterActive(
        { type: "send" },
        { filterKey: "type", rowValue: "export" }
      ),
      false
    );
  });
});
