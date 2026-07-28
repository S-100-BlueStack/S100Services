import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardActivityPath } from "./dashboardApi.js";

test("createDashboardActivityPath includes range, server filters, and cursor", () => {
  const path = createDashboardActivityPath(
    {
      fromQueryValue: "2026-07-20T00:00",
      toQueryValue: "2026-07-27T23:59",
    },
    {
      filters: {
        search: "failed export",
        type: "export",
        status: "failed",
        importance: "all",
        reports: "all",
        product: "all",
      },
      cursor: "abc-123",
    }
  );
  const url = new URL(path, "https://example.invalid/");

  assert.equal(url.pathname, "/electronicproducts/dashboard");
  assert.equal(url.searchParams.get("from"), "2026-07-20T00:00");
  assert.equal(url.searchParams.get("to"), "2026-07-27T23:59");
  assert.equal(url.searchParams.get("search"), "failed export");
  assert.equal(url.searchParams.get("type"), "export");
  assert.equal(url.searchParams.get("status"), "failed");
  assert.equal(url.searchParams.get("pageSize"), "50");
  assert.equal(url.searchParams.get("cursor"), "abc-123");
});
