import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as filters from "../domain/dashboardFilters.js";
import * as query from "../domain/dashboardQuery.js";
import * as range from "../domain/dashboardRange.js";

async function createHarness() {
  const source = await readFile(new URL("initDashboardPage.js", import.meta.url), "utf8");
  const requests = [];
  const renders = [];
  const routeUpdates = [];
  const timers = new Map();
  let timerId = 0;
  let currentTime = Date.parse("2026-09-17T06:05:00.000Z");
  let currentRoute = { rangePreset: "since-yesterday" };
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

  class ControlledDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [currentTime]));
    }
  }

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
      Date: ControlledDate,
      Error,
      noticeError() {},
      createDashboardDocumentTitle: () => "Dashboard",
      getCurrentDashboardRoute: () => currentRoute,
      setDashboardRouteUrl: (nextRange) => routeUpdates.push(nextRange),
      readDashboardPageSizePreference: () => 50,
      writeDashboardPageSizePreference() {},
      onDashboardPageSizePreferenceReset: () => ({ remove() {} }),
      renderDashboardPage: (args) => renders.push(args),
      fetchDashboardActivity(requestRange, state, options) {
        return new Promise((resolve, reject) => {
          requests.push({ range: requestRange, state, ...options, resolve, reject });
        });
      },
    }
  );

  const initialization = init();
  requests[0].resolve(payload("initial", "page-two"));
  const controller = await initialization;

  return {
    controller,
    document,
    window,
    requests,
    renders,
    routeUpdates,
    timers,
    latest: () => renders.at(-1),
    setTime(value) {
      currentTime = Date.parse(value);
    },
    setRoute(route) {
      currentRoute = route;
    },
    async emit(name, detail) {
      await document.emit(`pc-dashboard-${name}`, detail);
    },
    runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
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
    emit(name, detail) {
      return handlers.get(name)?.({ detail });
    },
  };
}

function payload(id, nextCursor = null) {
  return {
    activities: [{ id }],
    filterOptions: {},
    paging: {
      nextCursor,
      hasMore: Boolean(nextCursor),
      total: 1,
      returned: 1,
      pageSize: 50,
    },
  };
}

function draft({ fromDate = "2026-09-10", fromTime = "08:00", toDate = "", toTime = "" } = {}) {
  return { fromDate, fromTime, toDate, toTime };
}

async function settleScheduledLoad() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("invalid drafts do not request or update the route and Refresh uses applied state", async () => {
  const h = await createHarness();
  const appliedRangeKey = range.getDashboardRangeKey(h.controller.range);
  const requestCount = h.requests.length;

  await h.emit("range-change", { draft: draft({ fromDate: "" }) });
  await h.emit("range-change", {
    draft: draft({ toDate: "2026-09-09", toTime: "07:59" }),
  });

  assert.equal(h.requests.length, requestCount);
  assert.equal(h.routeUpdates.length, 0);
  assert.equal(h.latest().dashboard.activities[0].id, "initial");

  const refresh = h.controller.refresh();
  const refreshRequest = h.requests.at(-1);
  assert.equal(range.getDashboardRangeKey(refreshRequest.range), appliedRangeKey);
  refreshRequest.resolve(payload("refreshed"));
  await refresh;
  assert.equal(h.routeUpdates.length, 0);
  h.controller.destroy();
});

test("a valid committed range applies once, resets paging and ignores an identical repeat", async () => {
  const h = await createHarness();

  const pageTwo = h.emit("page-change", { direction: "next" });
  const pageRequest = h.requests.at(-1);
  pageRequest.resolve(payload("page-two", "page-three"));
  await pageTwo;

  const nextDraft = draft({
    fromDate: "2026-09-10",
    fromTime: "08:15",
    toDate: "2026-09-16",
    toTime: "17:45",
  });
  const before = h.requests.length;
  const pending = h.emit("range-change", { draft: nextDraft });
  assert.equal(h.requests.length, before);
  assert.equal(h.timers.size, 1);
  h.runTimers();
  const request = h.requests.at(-1);

  assert.equal(h.requests.length, before + 1);
  assert.equal(request.range.fromQueryValue, "2026-09-10T08:15:00");
  assert.equal(request.range.toQueryValue, "2026-09-16T17:45:00");
  assert.equal(request.state.cursor, null);
  assert.equal(request.state.pageSize, 50);
  assert.equal(request.state.sortBy, "time");
  assert.equal(request.state.sortDirection, "desc");
  assert.equal(h.routeUpdates.length, 1);
  assert.equal(h.latest().dashboard.activities[0].id, "page-two");

  request.resolve(payload("range"));
  await pending;
  await settleScheduledLoad();
  assert.equal(h.latest().pageNumber, 1);
  assert.equal(h.latest().canGoPrevious, false);

  await h.emit("range-change", { draft: nextDraft });
  assert.equal(h.requests.length, before + 1);
  assert.equal(h.routeUpdates.length, 1);
  h.controller.destroy();
});

test("clearing To applies an open range while failure retains the prior result and time", async () => {
  const h = await createHarness();
  const closedDraft = draft({ toDate: "2026-09-16", toTime: "23:59" });
  let pending = h.emit("range-change", { draft: closedDraft });
  h.runTimers();
  h.requests.at(-1).resolve(payload("closed"));
  await pending;
  await settleScheduledLoad();
  const successfulTime = h.latest().lastSuccessfulLoadAt.toISOString();

  h.setTime("2026-09-17T08:15:00.000Z");
  pending = h.emit("range-change", { draft: draft() });
  h.runTimers();
  const request = h.requests.at(-1);
  assert.equal(request.range.toQueryValue, null);
  assert.equal(h.routeUpdates.at(-1).toQueryValue, null);
  request.reject(new Error("Range failed"));
  await pending;
  await settleScheduledLoad();

  assert.equal(h.latest().dashboard.activities[0].id, "closed");
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), successfulTime);
  assert.equal(h.latest().error, "Range failed");
  h.controller.destroy();
});

test("a newer filter suppresses a stale range response while search stays debounced", async () => {
  const h = await createHarness();
  const rangePending = h.emit("range-change", { draft: draft() });
  h.runTimers();
  const rangeRequest = h.requests.at(-1);
  const filterPending = h.emit("filter-change", { filters: { status: "failed" } });
  const filterRequest = h.requests.at(-1);

  assert.equal(rangeRequest.signal.aborted, true);
  filterRequest.resolve(payload("filter"));
  await filterPending;
  rangeRequest.resolve(payload("stale-range"));
  await rangePending;
  assert.equal(h.latest().dashboard.activities[0].id, "filter");

  const beforeSearch = h.requests.length;
  await h.emit("filter-change", { filters: { search: "alpha" }, debounce: true });
  assert.equal(h.requests.length, beforeSearch);
  assert.equal(h.timers.size, 1);
  h.runTimers();
  assert.equal(h.requests.length, beforeSearch + 1);
  h.requests.at(-1).resolve(payload("search"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.latest().dashboard.activities[0].id, "search");
  h.controller.destroy();
});

test("a committed range supersedes pending search without a duplicate delayed load", async () => {
  const h = await createHarness();

  await h.emit("filter-change", { filters: { search: "alpha" }, debounce: true });
  assert.equal(h.timers.size, 1);
  const beforeRange = h.requests.length;
  const pending = h.emit("range-change", { draft: draft() });
  assert.equal(h.timers.size, 1);
  h.runTimers();
  const request = h.requests.at(-1);

  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, beforeRange + 1);
  assert.equal(request.state.filters.search, "alpha");
  request.resolve(payload("range-with-search"));
  await pending;
  await settleScheduledLoad();
  assert.equal(h.requests.length, beforeRange + 1);
  h.controller.destroy();
});

test("only the newest rapid range can publish rows and the last-successful time", async () => {
  const h = await createHarness();
  h.setTime("2026-09-17T07:10:00.000Z");
  const first = h.emit("range-change", {
    draft: draft({ fromDate: "2026-09-11" }),
  });
  h.runTimers();
  const firstRequest = h.requests.at(-1);

  h.setTime("2026-09-17T08:15:00.000Z");
  const second = h.emit("range-change", {
    draft: draft({ fromDate: "2026-09-12" }),
  });
  h.runTimers();
  const secondRequest = h.requests.at(-1);

  assert.equal(firstRequest.signal.aborted, true);
  secondRequest.resolve(payload("newest"));
  await second;
  await settleScheduledLoad();
  assert.equal(h.latest().dashboard.activities[0].id, "newest");
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T08:15:00.000Z");

  h.setTime("2026-09-17T09:20:00.000Z");
  firstRequest.resolve(payload("stale"));
  await first;
  await settleScheduledLoad();
  assert.equal(h.latest().dashboard.activities[0].id, "newest");
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T08:15:00.000Z");
  h.controller.destroy();
});

test("a following Refresh coalesces a pending range auto-apply into one request", async () => {
  const h = await createHarness();
  const before = h.requests.length;

  await h.emit("range-change", {
    draft: draft({ fromTime: "15:00" }),
  });

  assert.equal(h.requests.length, before);
  assert.equal(h.timers.size, 1);

  const refresh = h.controller.refresh();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, before + 1);
  assert.equal(h.requests.at(-1).range.fromQueryValue, "2026-09-10T15:00:00");
  h.requests.at(-1).resolve(payload("coalesced"));
  await refresh;
  assert.equal(h.latest().dashboard.activities[0].id, "coalesced");
  h.controller.destroy();
});

test("Back and Forward load the valid route without writing another history entry", async () => {
  const h = await createHarness();
  h.setRoute({
    rangePreset: "custom",
    from: "2026-09-01T08:00:00",
    to: "2026-09-15T17:00:00",
  });

  const pending = h.window.emit("popstate");
  const request = h.requests.at(-1);
  assert.equal(request.range.fromQueryValue, "2026-09-01T08:00:00");
  assert.equal(request.range.toQueryValue, "2026-09-15T17:00:00");
  assert.equal(request.state.cursor, null);
  assert.equal(h.routeUpdates.length, 0);

  request.resolve(payload("history"));
  await pending;
  assert.equal(h.latest().dashboard.activities[0].id, "history");
  assert.equal(h.routeUpdates.length, 0);
  h.controller.destroy();
});
