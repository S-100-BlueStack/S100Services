import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardActivityPath, fetchDashboardActivity } from "./dashboardApi.js";

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
      sortBy: "product",
      sortDirection: "asc",
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
  assert.equal(url.searchParams.get("sortBy"), "product");
  assert.equal(url.searchParams.get("sortDirection"), "asc");
});

const DASHBOARD_RANGE = { fromQueryValue: "2026-10-01" };
const DASHBOARD_QUERY = { filters: {}, pageSize: 50 };

async function withDashboardResponse(
  { status = 200, contentType = "application/json", body },
  run
) {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} };
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  });

  try {
    await run();
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("Dashboard accepts a valid empty activity list", async () => {
  await withDashboardResponse(
    { body: { Success: true, Data: { Activities: [], Paging: { Total: 0 } } } },
    async () => {
      const dashboard = await fetchDashboardActivity(DASHBOARD_RANGE, DASHBOARD_QUERY);
      assert.deepEqual(dashboard.activities, []);
      assert.equal(dashboard.summary.totalActivities, 0);
      assert.equal(dashboard.paging.total, 0);
    }
  );
});

for (const [name, body] of [
  ["null", null],
  ["missing activities", { Success: true, Data: { Summary: { TotalActivities: 0 } } }],
  ["malformed activities", { Success: true, Data: { Activities: "invalid" } }],
  ["failed envelope", { Success: false, Data: { Activities: [] } }],
  ["failed nested envelope", { Data: { Success: false, Activities: [] } }],
  ["null success", { Success: null, Data: { Activities: [] } }],
]) {
  test(`Dashboard rejects ${name} instead of publishing empty success`, async () => {
    await withDashboardResponse({ body }, async () => {
      await assert.rejects(
        fetchDashboardActivity(DASHBOARD_RANGE, DASHBOARD_QUERY),
        /Dashboard (response is invalid|request was not successful)/
      );
    });
  });
}

test("Dashboard rejects an unexpected HTTP 200 HTML body", async () => {
  await withDashboardResponse(
    { contentType: "text/html", body: "<html>Gateway failure</html>" },
    async () => {
      await assert.rejects(
        fetchDashboardActivity(DASHBOARD_RANGE, DASHBOARD_QUERY),
        /Dashboard response is invalid/
      );
    }
  );
});

test("Dashboard rejects 204 because this endpoint requires an activity payload", async () => {
  await withDashboardResponse({ status: 204, body: null }, async () => {
    await assert.rejects(
      fetchDashboardActivity(DASHBOARD_RANGE, DASHBOARD_QUERY),
      /Dashboard response is invalid/
    );
  });
});
