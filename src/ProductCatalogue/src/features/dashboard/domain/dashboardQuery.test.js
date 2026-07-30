import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDashboardQueryParameters,
  createDashboardPagingState,
  moveDashboardPage,
  resetDashboardPaging,
} from "./dashboardQuery.js";

test("appendDashboardQueryParameters omits all filters and includes paging", () => {
  const params = appendDashboardQueryParameters(new URLSearchParams(), {
    filters: {
      search: "  rejected  ",
      type: "export",
      status: "all",
      importance: "failed",
      reports: "all",
      product: "101DK001",
    },
    cursor: "next-token",
  });

  assert.equal(params.get("search"), "rejected");
  assert.equal(params.get("type"), "export");
  assert.equal(params.has("status"), false);
  assert.equal(params.get("importance"), "failed");
  assert.equal(params.has("reports"), false);
  assert.equal(params.get("product"), "101DK001");
  assert.equal(params.get("pageSize"), "50");
  assert.equal(params.get("cursor"), "next-token");
});

test("moveDashboardPage keeps a cursor stack for previous navigation", () => {
  const first = createDashboardPagingState();
  const second = moveDashboardPage(first, { nextCursor: "page-2" }, "next");
  const third = moveDashboardPage(second, { nextCursor: "page-3" }, "next");

  assert.deepEqual(second, { cursor: "page-2", cursorHistory: [null] });
  assert.deepEqual(third, { cursor: "page-3", cursorHistory: [null, "page-2"] });
  assert.deepEqual(moveDashboardPage(third, {}, "previous"), {
    cursor: "page-2",
    cursorHistory: [null],
  });
  assert.deepEqual(resetDashboardPaging(), { cursor: null, cursorHistory: [] });
});
