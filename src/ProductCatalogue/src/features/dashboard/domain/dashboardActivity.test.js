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
  it("normalizes API payloads and preserves backend activity order", () => {
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

    assert.deepEqual(
      dashboard.activities.map((activity) => activity.id),
      ["old", "new"]
    );
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

it("keeps invalid Activity status local and preserves authoritative statuses, facets and totals", () => {
  const activities = [
    { Id: "absent", Type: "send", Description: "Delivery failed" },
    { Id: "null", Status: null, Severity: "critical" },
    { Id: "blank", Status: " " },
    { Id: "wrong-type", Status: ["failed"] },
    { Id: "unsupported", Status: "Open errors" },
    { Id: "failed", Status: " Failed " },
    { Id: "cancelled", Type: "cancel", Status: "completed" },
    { Id: "compat-error", Status: "error" },
    { Id: "compat-rejected", Status: "rejected" },
    { Id: "active", Status: "active" },
    { Id: "idle", Status: "idle" },
  ];
  const expected = [
    null,
    null,
    null,
    null,
    null,
    "failed",
    "completed",
    "error",
    "rejected",
    "active",
    "idle",
  ];
  const fallback = normalizeDashboardPayload({ Activities: activities }, TEST_RANGE);
  assert.deepEqual(
    fallback.activities.map(({ status }) => status),
    expected
  );
  assert.equal(fallback.activities[0].isImportant, false);
  assert.equal(fallback.activities[1].isImportant, true);
  assert.equal(fallback.summary.failedOperations, 3);
  assert.deepEqual(
    fallback.filterOptions.statuses.map(({ value }) => value),
    ["active", "completed", "error", "failed", "idle", "rejected"]
  );

  const authoritative = normalizeDashboardPayload(
    {
      Activities: activities,
      FilterOptions: { Statuses: [{ Value: "completed", Label: "Completed (server)" }] },
      Summary: { TotalActivities: 33, FailedOperations: 7 },
      StatusSummary: [{ Status: "completed", Count: 21 }],
      Paging: { Total: 33, HasMore: true, NextCursor: "server-cursor" },
    },
    TEST_RANGE
  );
  assert.deepEqual(authoritative.filterOptions.statuses, [
    { value: "completed", label: "Completed (server)" },
  ]);
  assert.deepEqual(authoritative.statusSummary, [{ label: "completed", count: 21, failed: 0 }]);
  assert.equal(authoritative.summary.totalActivities, 33);
  assert.equal(authoritative.summary.failedOperations, 7);
  assert.equal(authoritative.paging.total, 33);
  assert.equal(authoritative.paging.nextCursor, "server-cursor");
});
