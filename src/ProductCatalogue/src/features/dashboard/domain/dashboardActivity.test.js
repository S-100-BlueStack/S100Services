import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDashboardPayload } from "./dashboardActivity.js";

const TEST_RANGE = {
  preset: "since-yesterday",
  label: "Since yesterday",
  fromIso: "2026-07-07T00:00:00.000Z",
  toIso: "2026-07-08T10:30:00.000Z",
  displayLabel: "Since yesterday",
  timeZone: "Europe/Copenhagen",
};

describe("dashboardActivity", () => {
  it("normalizes API payloads and sorts newest activity first", () => {
    const dashboard = normalizeDashboardPayload(
      {
        data: {
          activities: [
            {
              id: "old",
              timestamp: "2026-07-07T10:00:00.000Z",
              datasetName: "A",
              type: "send",
              status: "completed",
            },
            {
              id: "new",
              timestamp: "2026-07-08T10:00:00.000Z",
              datasetName: "B",
              type: "export",
              status: "failed",
            },
          ],
        },
      },
      TEST_RANGE
    );

    assert.equal(dashboard.activities[0].id, "new");
    assert.equal(dashboard.summary.totalActivities, 2);
    assert.equal(dashboard.summary.productsTouched, 2);
    assert.equal(dashboard.summary.failedOperations, 1);
    assert.equal(dashboard.importantChanges.length, 1);
  });

  it("uses PascalCase summary and summary row values from the backend", () => {
    const dashboard = normalizeDashboardPayload(
      {
        Data: {
          Summary: {
            TotalActivities: 10,
            ProductsTouched: 4,
            ImportantChanges: 3,
            FailedOperations: 2,
            ReportsAvailable: 1,
          },
          StatusSummary: [{ Status: "Exported", Count: 7 }],
          OperationSummary: [{ Type: "Export", Count: 7, Failed: 1 }],
          Activities: [],
        },
      },
      { ...TEST_RANGE, preset: "last-7-days" }
    );

    assert.equal(dashboard.summary.totalActivities, 10);
    assert.equal(dashboard.summary.productsTouched, 4);
    assert.equal(dashboard.summary.importantChanges, 3);
    assert.equal(dashboard.summary.failedOperations, 2);
    assert.equal(dashboard.summary.reportsAvailable, 1);
    assert.deepEqual(dashboard.statusSummary[0], {
      label: "Exported",
      count: 7,
      failed: 0,
    });
    assert.deepEqual(dashboard.operationSummary[0], {
      label: "Export",
      count: 7,
      failed: 1,
    });
  });

  it("normalizes report arrays while keeping singular aliases during transition", () => {
    const dashboard = normalizeDashboardPayload(
      {
        Data: {
          Activities: [
            {
              Id: "activity-1",
              Timestamp: "2026-07-08T10:00:00+02:00",
              DatasetName: "101DK0040943E",
              Type: "validation",
              Status: "completed",
              Links: {
                Review: true,
                Analyze: true,
                History: true,
                IcEncReports: [
                  {
                    Id: "icenc-1",
                    Title: "IC-ENC report",
                    Status: "available",
                    GeneratedAt: "2026-07-08T10:00:00+02:00",
                  },
                ],
                InternalValidationReports: [
                  {
                    Id: "internal-1",
                    Title: "Internal validation",
                    Status: "warning",
                  },
                ],
              },
            },
          ],
        },
      },
      TEST_RANGE
    );

    const links = dashboard.activities[0].links;

    assert.equal(links.icEncReports.length, 1);
    assert.equal(links.internalValidationReports.length, 1);
    assert.equal(links.icEncReport.reportId, "icenc-1");
    assert.equal(links.internalValidation.reportId, "internal-1");
    assert.equal(dashboard.summary.reportsAvailable, 2);
  });
});
