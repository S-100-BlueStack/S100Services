import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as filters from "../domain/dashboardFilters.js";
import * as query from "../domain/dashboardQuery.js";
import * as range from "../domain/dashboardRange.js";

// Execute the real controller with only its browser, transport and rendering boundaries replaced.
async function createHarness() {
  const source = await readFile(new URL("initDashboardPage.js", import.meta.url), "utf8");
  const requests = [];
  const renders = [];
  const timers = new Map();
  const persistedSizes = [];
  let timerId = 0;
  const document = createEventTarget();
  document.body = { classList: { add() {}, remove() {} } };
  const window = {
    ...createEventTarget(),
    setTimeout(callback) {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const init = runInNewContext(
    source.replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "").replace("export async", "async") +
      "\ninitDashboardPage;",
    {
      ...filters,
      ...query,
      ...range,
      document,
      window,
      AbortController,
      Error,
      noticeError() {},
      createDashboardDocumentTitle: () => "Dashboard",
      getCurrentDashboardRoute: () => ({ rangePreset: "last-7-days" }),
      setDashboardRouteUrl() {},
      readDashboardPageSizePreference: () => 50,
      writeDashboardPageSizePreference: (size) => persistedSizes.push(size),
      onDashboardPageSizePreferenceReset: () => ({ remove() {} }),
      renderDashboardPage: (args) => renders.push(args),
      fetchDashboardActivity(requestRange, state, options) {
        return new Promise((resolve, reject) => {
          requests.push({ range: requestRange, state, ...options, resolve, reject });
        });
      },
    }
  );
  const initial = init();
  requests[0].resolve(payload("initial"));
  const controller = await initial;
  return {
    requests,
    renders,
    timers,
    persistedSizes,
    controller,
    emit: (name, detail) => document.emit(`pc-dashboard-${name}`, detail),
    latest: () => renders.at(-1),
  };
}

function createEventTarget() {
  const handlers = new Map();
  return {
    addEventListener(name, handler) {
      handlers.set(name, handler);
    },
    removeEventListener(name) {
      handlers.delete(name);
    },
    async emit(name, detail) {
      await handlers.get(name)?.({ detail });
    },
  };
}

function payload(id, nextCursor = `${id}-next`) {
  return {
    activities: [{ id }],
    filterOptions: {},
    paging: { nextCursor, hasMore: Boolean(nextCursor), total: 100, returned: 50, pageSize: 50 },
  };
}

async function succeed(harness, action, id) {
  const pending = action();
  harness.requests.at(-1).resolve(payload(id));
  await pending;
  return harness.requests.at(-1);
}

function assertSort(state, field, direction) {
  assert.equal(state.sortBy, field);
  assert.equal(state.sortDirection, direction);
}

test("sort change resets page two, preserves filters and page size, and rolls back on failure", async () => {
  const h = await createHarness();
  assertSort(h.requests[0].state, "time", "desc");
  await succeed(h, () => h.emit("page-size-change", { pageSize: 100 }), "size");
  await succeed(h, () => h.emit("filter-change", { filters: { search: "alpha" } }), "filter");
  await succeed(h, () => h.emit("page-change", { direction: "next" }), "page-two");
  assert.equal(h.latest().pageNumber, 2);

  const pending = h.emit("sort-change", { sortBy: "product" });
  const request = h.requests.at(-1);
  assertSort(request.state, "product", "asc");
  assert.equal(request.state.cursor, null);
  assert.equal(request.state.pageSize, 100);
  assert.equal(request.state.filters.search, "alpha");
  request.reject(new Error("Sort failed"));
  await pending;

  assertSort(h.latest(), "time", "desc");
  assert.equal(h.latest().pageNumber, 2);
  assert.equal(h.latest().canGoPrevious, true);
  assert.equal(h.latest().dashboard.activities[0].id, "page-two");
  assert.equal(h.latest().error, "Sort failed");
  const refresh = await succeed(h, () => h.controller.refresh(), "restored");
  assert.equal(refresh.state.cursor, "filter-next");
  await succeed(h, () => h.emit("page-change", { direction: "previous" }), "page-one");
  assert.equal(h.requests.at(-1).state.cursor, null);
  h.controller.destroy();
});

test("only the latest sort response can replace rows and pending search is superseded", async () => {
  const h = await createHarness();
  await h.emit("filter-change", { filters: { search: "alpha" }, debounce: true });
  assert.equal(h.timers.size, 1);
  const first = h.emit("sort-change", { sortBy: "product" });
  const firstRequest = h.requests.at(-1);
  assertSort(firstRequest.state, "product", "asc");
  assert.equal(h.timers.size, 0);
  const second = h.emit("sort-change", { sortBy: "product" });
  const secondRequest = h.requests.at(-1);
  assertSort(secondRequest.state, "product", "desc");
  const third = h.emit("sort-change", { sortBy: "status" });
  const thirdRequest = h.requests.at(-1);
  assertSort(thirdRequest.state, "status", "asc");
  assert.equal(thirdRequest.state.filters.search, "alpha");
  assert.equal(firstRequest.signal.aborted, true);
  assert.equal(secondRequest.signal.aborted, true);
  thirdRequest.resolve(payload("latest"));
  await third;
  firstRequest.resolve(payload("obsolete"));
  secondRequest.reject(new Error("Obsolete failure"));
  await Promise.all([first, second]);
  assert.equal(h.latest().dashboard.activities[0].id, "latest");
  assert.equal(h.latest().error, null);
  assertSort(h.latest(), "status", "asc");
  h.controller.destroy();
});

test("failed rapid sorts restore the last successful sort rather than an unfinished intermediate sort", async () => {
  const h = await createHarness();
  await succeed(h, () => h.emit("sort-change", { sortBy: "activity" }), "activity");
  await succeed(h, () => h.emit("page-change", { direction: "next" }), "page-two");
  const first = h.emit("sort-change", { sortBy: "product" });
  const firstRequest = h.requests.at(-1);
  const second = h.emit("sort-change", { sortBy: "status" });
  h.requests.at(-1).reject(new Error("Latest failed"));
  await second;
  firstRequest.resolve(payload("obsolete"));
  await first;
  assertSort(h.latest(), "activity", "asc");
  assert.equal(h.latest().pageNumber, 2);
  assert.equal(h.latest().dashboard.activities[0].id, "page-two");
  h.controller.destroy();
});

test("sort survives filters, search, range, page size, refresh and cursor navigation", async () => {
  const h = await createHarness();
  await succeed(h, () => h.emit("sort-change", { sortBy: "status" }), "sorted");
  const actions = [
    () => h.emit("filter-change", { filters: { status: "failed", search: "alpha" } }),
    () => h.emit("range-change", { preset: "last-7-days" }),
    () => h.emit("page-size-change", { pageSize: 25 }),
    () => h.emit("refresh"),
    () => h.emit("page-change", { direction: "next" }),
    () => h.emit("page-change", { direction: "previous" }),
  ];
  for (const action of actions) {
    const request = await succeed(h, action, "next");
    assertSort(request.state, "status", "asc");
  }
  assert.deepEqual(h.persistedSizes, [25]);
  await succeed(h, () => h.emit("page-change", { direction: "next" }), "page-two");
  await succeed(h, () => h.emit("sort-change", { sortBy: "time" }), "time");
  assertSort(h.latest(), "time", "desc");
  assert.equal(h.latest().pageNumber, 1);
  assert.equal(h.latest().canGoPrevious, false);
  assert.equal(h.requests.at(-1).state.cursor, null);
  await succeed(h, () => h.emit("sort-change", { sortBy: "time" }), "oldest");
  assertSort(h.latest(), "time", "asc");
  h.controller.destroy();
});

test("failed sort after a page-size change cannot resurrect the old cursor generation", async () => {
  const h = await createHarness();
  await succeed(h, () => h.emit("page-change", { direction: "next" }), "page-two");
  const size = h.emit("page-size-change", { pageSize: 25 });
  h.requests.at(-1).reject(new Error("Size failed"));
  await size;
  const sort = h.emit("sort-change", { sortBy: "product" });
  h.requests.at(-1).reject(new Error("Sort failed"));
  await sort;
  assertSort(h.latest(), "time", "desc");
  assert.equal(h.latest().pagingMatchesPageSize, false);
  assert.equal(h.latest().canGoPrevious, false);
  const request = await succeed(h, () => h.controller.refresh(), "recovered");
  assert.equal(request.state.pageSize, 25);
  assert.equal(request.state.cursor, null);
  h.controller.destroy();
});

test("destroy aborts a pending sort and prevents stale rendering", async () => {
  const h = await createHarness();
  const pending = h.emit("sort-change", { sortBy: "product" });
  const request = h.requests.at(-1);
  h.controller.destroy();
  const renderCount = h.renders.length;
  assert.equal(request.signal.aborted, true);
  request.resolve(payload("obsolete"));
  await pending;
  assert.equal(h.renders.length, renderCount);
});
