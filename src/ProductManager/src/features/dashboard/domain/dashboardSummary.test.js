import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDashboardSummary,
  createDashboardSummaryFromActivities,
} from "./dashboardSummary.js";

const ACTIVITIES = [
  {
    datasetName: "101DK0040943E",
    status: "failed",
    isImportant: true,
    links: { icEncReports: [{ id: "icenc-1" }], internalValidationReports: [] },
  },
  {
    datasetName: "101DK0040944E",
    status: "completed",
    isImportant: false,
    links: { icEncReports: [], internalValidationReports: [{ id: "validation-1" }] },
  },
  {
    datasetName: "101DK0040943E",
    status: "rejected",
    isImportant: true,
    links: { icEncReports: [], internalValidationReports: [] },
  },
];

describe("dashboardSummary", () => {
  it("uses backend summary values when an unfiltered summary is provided", () => {
    const summary = createDashboardSummary({
      summary: {
        TotalActivities: 12,
        ProductsTouched: 8,
        ImportantChanges: 3,
        FailedOperations: 2,
        ReportsAvailable: 4,
      },
      activities: ACTIVITIES,
    });

    assert.deepEqual(summary, {
      totalActivities: 12,
      productsTouched: 8,
      importantChanges: 3,
      failedOperations: 2,
      reportsAvailable: 4,
    });
  });

  it("derives filtered summary values only from the supplied activities", () => {
    const summary = createDashboardSummaryFromActivities(ACTIVITIES.slice(0, 2));

    assert.deepEqual(summary, {
      totalActivities: 2,
      productsTouched: 2,
      importantChanges: 1,
      failedOperations: 1,
      reportsAvailable: 2,
    });
  });
});
