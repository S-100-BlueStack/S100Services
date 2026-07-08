import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDashboardPayload } from "./dashboardActivity.js";

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
      { preset: "since-yesterday" }
    );

    assert.equal(dashboard.activities[0].id, "new");
    assert.equal(dashboard.summary.totalActivities, 2);
    assert.equal(dashboard.summary.productsTouched, 2);
    assert.equal(dashboard.summary.failedOperations, 1);
    assert.equal(dashboard.importantChanges.length, 1);
  });

  it("uses summary values when the backend provides them", () => {
    const dashboard = normalizeDashboardPayload(
      {
        data: {
          summary: {
            totalActivities: 10,
            productsTouched: 4,
            importantChanges: 3,
            failedOperations: 2,
            reportsAvailable: 1,
          },
          activities: [],
        },
      },
      { preset: "last-7-days" }
    );

    assert.equal(dashboard.summary.totalActivities, 10);
    assert.equal(dashboard.summary.productsTouched, 4);
    assert.equal(dashboard.summary.importantChanges, 3);
    assert.equal(dashboard.summary.failedOperations, 2);
    assert.equal(dashboard.summary.reportsAvailable, 1);
  });
});
