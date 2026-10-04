import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterDashboardActivities, normalizeDashboardFilters } from "./dashboardFilters.js";

describe("dashboard search normalization", () => {
  it("preserves the user's search casing while trimming surrounding whitespace", () => {
    const filters = normalizeDashboardFilters({ search: "  TEST Product  " });

    assert.equal(filters.search, "TEST Product");
  });

  it("keeps legacy client-side filtering case-insensitive", () => {
    const activities = [
      {
        id: "test-activity",
        datasetName: "101DKTEST",
        productName: "101DKTEST",
        type: "export",
        status: "completed",
        severity: "normal",
        title: "Test Export",
        description: "Product export completed.",
        actor: "DOMAIN\\Operator",
        isImportant: false,
        links: {
          icEncReports: [],
          internalValidationReports: [],
        },
        details: [],
      },
    ];

    assert.equal(filterDashboardActivities(activities, { search: "TEST" }).length, 1);
    assert.equal(filterDashboardActivities(activities, { search: "test" }).length, 1);
  });
});
