import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as filters from "../domain/dashboardFilters.js";
import * as query from "../domain/dashboardQuery.js";
import * as range from "../domain/dashboardRange.js";

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
      total: 2,
      returned: 1,
      pageSize: 50,
    },
  };
}

async function createHarness() {
  const source = await readFile(new URL("initDashboardPage.js", import.meta.url), "utf8");
  const requests = [];
  const renders = [];
  const notices = [];
  const timers = new Map();
  let nextTimerId = 0;
  let currentTime = Date.parse("2026-10-01T08:00:00Z");
  let currentRoute = { rangePreset: "since-yesterday" };
  const document = createEventTarget();
  document.body = { classList: { add() {}, remove() {} } };
  const window = {
    ...createEventTarget(),
    setTimeout(callback) {
      const timerId = ++nextTimerId;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
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
      noticeError: (...args) => notices.push(args),
      createDashboardDocumentTitle: () => "Dashboard",
      getCurrentDashboardRoute: () => currentRoute,
      setDashboardRouteUrl() {},
      readDashboardPageSizePreference: () => 50,
      writeDashboardPageSizePreference() {},
      onDashboardPageSizePreferenceReset: () => ({ remove() {} }),
      renderDashboardPage: (args) => renders.push(args),
      fetchDashboardActivity(requestRange, state, { signal }) {
        return new Promise((resolve, reject) => {
          requests.push({ range: requestRange, state, signal, resolve, reject });
        });
      },
    }
  );
  const initializing = init();
  requests[0].resolve(payload("initial", "next-page"));
  const controller = await initializing;
  return {
    requests,
    renders,
    notices,
    timers,
    controller,
    latest: () => renders.at(-1),
    emit: (name, detail) => document.emit(`pc-dashboard-${name}`, detail),
    go: () => window.emit("popstate"),
    setRoute(route) {
      currentRoute = route;
    },
    setTime(value) {
      currentTime = Date.parse(value);
    },
    runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function scheduleSearch(h, text) {
  return h.emit("filter-change", { filters: { search: text }, debounce: true });
}

test("search debounce then UI Refresh performs only one load with the newest search", async () => {
  const h = await createHarness();
  scheduleSearch(h, "alpha");
  assert.equal(h.timers.size, 1);
  const start = h.requests.length;
  const refresh = h.emit("refresh");
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, start + 1);
  assert.equal(h.requests.at(-1).state.filters.search, "alpha");
  h.requests.at(-1).resolve(payload("refreshed"));
  await refresh;
  h.runTimers();
  assert.equal(h.requests.length, start + 1);
  assert.equal(h.latest().dashboard.activities[0].id, "refreshed");
  assert.equal(h.notices.length, 0);
  h.controller.destroy();
});

test("search debounce then public refresh respects the page reset and avoids stale timestamp updates", async () => {
  const h = await createHarness();
  const nextPage = h.emit("page-change", { direction: "next" });
  h.requests.at(-1).resolve(payload("page-two"));
  await nextPage;
  const page = h.latest().pageNumber;
  const before = h.latest().lastSuccessfulLoadAt.toISOString();
  h.setTime("2026-10-01T09:00:00Z");
  scheduleSearch(h, "beta");
  const start = h.requests.length;
  const refresh = h.controller.refresh();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, start + 1);
  assert.equal(h.requests.at(-1).state.filters.search, "beta");
  h.requests.at(-1).resolve(payload("public-refresh"));
  await refresh;
  assert.equal(h.latest().pageNumber, 1); // Search filter reset the paging before Refresh.
  assert.notEqual(h.latest().pageNumber, page);
  assert.notEqual(h.latest().lastSuccessfulLoadAt.toISOString(), before);
  const accepted = h.latest().lastSuccessfulLoadAt.toISOString();
  h.setTime("2026-10-01T10:00:00Z");
  h.runTimers();
  assert.equal(h.requests.length, start + 1);
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), accepted);
  h.controller.destroy();
});

test("search debounce then Back and Forward each load once for the current route", async () => {
  const h = await createHarness();
  scheduleSearch(h, "alpha");
  const start = h.requests.length;
  h.setRoute({ rangePreset: "last-7-days" });
  const back = h.go();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, start + 1);
  assert.equal(h.requests.at(-1).state.filters.search, "alpha");
  assert.equal(h.requests.at(-1).state.cursor, null);
  assert.equal(h.requests.at(-1).range.preset, "last-7-days");
  h.requests.at(-1).resolve(payload("back"));
  await back;
  h.runTimers();
  assert.equal(h.requests.length, start + 1);

  scheduleSearch(h, "bravo");
  h.setRoute({ rangePreset: "since-yesterday" });
  const forward = h.go();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, start + 2);
  assert.equal(h.requests.at(-1).state.filters.search, "bravo");
  h.requests.at(-1).resolve(payload("forward"));
  await forward;
  h.runTimers();
  assert.equal(h.requests.length, start + 2);
  assert.equal(h.latest().dashboard.activities[0].id, "forward");
  h.controller.destroy();
});

test("normal search typing coalesces; an older read cannot replace the immediate load", async () => {
  const h = await createHarness();
  const older = h.controller.refresh();
  const olderRequest = h.requests.at(-1);
  scheduleSearch(h, "a");
  scheduleSearch(h, "ab");
  scheduleSearch(h, "abc");
  assert.equal(h.timers.size, 1);
  assert.equal(h.requests.length, 2);
  h.runTimers();
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests.at(-1).state.filters.search, "abc");
  h.requests.at(-1).resolve(payload("search"));
  await new Promise((resolve) => setImmediate(resolve));
  olderRequest.resolve(payload("stale"));
  await older;
  assert.equal(h.latest().dashboard.activities[0].id, "search");
  assert.equal(h.latest().error, null);
  h.controller.destroy();
});
