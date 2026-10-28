import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardCoreDirectory = new URL("./", import.meta.url);

test("Dashboard page-size changes reuse the existing paging and stale-request boundary", async () => {
  const source = await readFile(new URL("initDashboardPage.js", dashboardCoreDirectory), "utf8");

  assert.match(source, /let currentPageSize = readDashboardPageSizePreference\(\);/);
  assert.match(
    source,
    /createDashboardQueryState\(\{[\s\S]*?filters: currentFilters,[\s\S]*?cursor: pagingState\.cursor,[\s\S]*?pageSize: requestPageSize,/
  );
  assert.match(source, /const requestId = \+\+loadRequestId;/);
  assert.match(source, /requestId !== loadRequestId \|\| requestController\.signal\.aborted/);
  assert.match(
    source,
    /currentPageSize = nextPageSize;[\s\S]*?pageSizeGeneration \+= 1;[\s\S]*?loadDashboard\(currentRange, \{ updateUrl: false, resetPage: true \}\)/
  );
  assert.match(source, /currentDashboardPageSizeGeneration !== pageSizeGeneration[\s\S]*?return;/);
});

test("Dashboard preference reset returns the live page size to the default without persisting it again", async () => {
  const [source, preferences] = await Promise.all([
    readFile(new URL("initDashboardPage.js", dashboardCoreDirectory), "utf8"),
    readFile(new URL("../../preferences/ui/preferencesPanel.js", dashboardCoreDirectory), "utf8"),
  ]);

  assert.match(source, /onDashboardPageSizePreferenceReset\(\(\{ pageSize \}\) => \{/);
  assert.match(
    source,
    /handlePageSizeChange\(\{ detail: \{ pageSize \} \}, \{ persist: false \}\)/
  );
  assert.match(preferences, /pc-dashboard-route[\s\S]*?resetDashboardPageSizePreference\(\);/);
});

test("Dashboard page-size UI stays in the pagination footer and out of route state", async () => {
  const [pageSource, routeSource] = await Promise.all([
    readFile(new URL("../ui/dashboardPage.js", dashboardCoreDirectory), "utf8"),
    readFile(new URL("../routing/dashboardRoute.js", dashboardCoreDirectory), "utf8"),
  ]);

  assert.match(pageSource, /text\.textContent = "Rows per page";/);
  assert.match(pageSource, /for \(const option of DASHBOARD_PAGE_SIZE_OPTIONS\)/);
  assert.match(pageSource, /controls\.append\(createPageSizeControl\(pageSize\), actions\);/);
  assert.doesNotMatch(routeSource, /pageSize|rows per page/i);
});
