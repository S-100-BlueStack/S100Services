import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_DEFAULT_PAGE_SIZE,
  DASHBOARD_PAGE_SIZE_OPTIONS,
  appendDashboardQueryParameters,
  createDashboardPagingState,
  createDashboardQueryState,
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

test("appendDashboardQueryParameters uses the selected page size", () => {
  const params = appendDashboardQueryParameters(new URLSearchParams(), {
    pageSize: 100,
  });

  assert.equal(params.get("pageSize"), "100");
});

test("Dashboard page size supports only the configured choices and defaults to 50", () => {
  assert.deepEqual(DASHBOARD_PAGE_SIZE_OPTIONS, [25, 50, 100, 200]);
  assert.equal(DASHBOARD_DEFAULT_PAGE_SIZE, 50);
  assert.equal(createDashboardQueryState({ pageSize: 25 }).pageSize, 25);
  assert.equal(createDashboardQueryState({ pageSize: 100 }).pageSize, 100);
  assert.equal(createDashboardQueryState({ pageSize: 75 }).pageSize, 50);
  assert.equal(createDashboardQueryState({ pageSize: "invalid" }).pageSize, 50);
});

test("query state preserves filters while page size and cursor change independently", () => {
  const filters = {
    search: "failed",
    type: "export",
    status: "all",
    importance: "failed",
    reports: "all",
    product: "101DK001",
  };
  const state = createDashboardQueryState({ filters, cursor: "cursor-2", pageSize: 100 });

  assert.deepEqual(state.filters, filters);
  assert.equal(state.cursor, "cursor-2");
  assert.equal(state.pageSize, 100);
  assert.deepEqual(resetDashboardPaging(), { cursor: null, cursorHistory: [] });
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
