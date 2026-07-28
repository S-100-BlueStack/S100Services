import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDashboardPayload } from "./dashboardActivity.js";

test("normalizeDashboardPayload preserves server paging and filter options", () => {
  const dashboard = normalizeDashboardPayload(
    {
      Data: {
        Summary: { TotalActivities: 125 },
        Paging: {
          PageSize: 50,
          Returned: 50,
          Total: 125,
          HasMore: true,
          NextCursor: "cursor-2",
        },
        FilterOptions: {
          Types: [{ Value: "export", Label: "Export" }],
          Statuses: [{ Value: "failed", Label: "Failed" }],
          Products: [{ Value: "101DK001", Label: "101DK001" }],
        },
        Activities: [],
      },
    },
    {
      preset: "last-7-days",
      fromIso: "2026-07-20T00:00:00+02:00",
      toIso: "2026-07-27T23:59:00+02:00",
    }
  );

  assert.deepEqual(dashboard.paging, {
    pageSize: 50,
    returned: 50,
    total: 125,
    hasMore: true,
    nextCursor: "cursor-2",
  });
  assert.deepEqual(dashboard.filterOptions.types, [{ value: "export", label: "Export" }]);
  assert.deepEqual(dashboard.filterOptions.statuses, [{ value: "failed", label: "Failed" }]);
  assert.deepEqual(dashboard.filterOptions.products, [{ value: "101DK001", label: "101DK001" }]);
});

test("normalizeDashboardPayload preserves backend ID ordering for equal timestamps", () => {
  const timestamp = "2026-07-27T10:00:00+02:00";
  const dashboard = normalizeDashboardPayload(
    {
      Data: {
        Activities: [
          { Id: "a", Timestamp: timestamp, DatasetName: "101DK001" },
          { Id: "c", Timestamp: timestamp, DatasetName: "101DK003" },
          { Id: "b", Timestamp: timestamp, DatasetName: "101DK002" },
        ],
      },
    },
    { preset: "last-7-days" }
  );

  assert.deepEqual(
    dashboard.activities.map((activity) => activity.id),
    ["c", "b", "a"]
  );
});
