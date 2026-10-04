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
  const document = createEventTarget();
  document.body = { classList: { add() {}, remove() {} } };
  const window = {
    ...createEventTarget(),
    setTimeout,
    clearTimeout,
  };
  let currentTime = Date.parse("2026-09-17T06:05:00.000Z");

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
      getCurrentDashboardRoute: () => ({ rangePreset: "since-yesterday" }),
      setDashboardRouteUrl() {},
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
  return {
    requests,
    renders,
    document,
    initialization,
    setTime(value) {
      currentTime = Date.parse(value);
    },
    latest() {
      return renders.at(-1);
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

function payload(id) {
  return {
    activities: [{ id }],
    filterOptions: {},
    paging: { nextCursor: null, hasMore: false, total: 1, returned: 1, pageSize: 50 },
  };
}

test("accepted loads publish time while failed and stale requests retain the latest success", async () => {
  const h = await createHarness();
  assert.equal(h.latest().lastSuccessfulLoadAt, null);

  h.requests[0].resolve(payload("initial"));
  const controller = await h.initialization;
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T06:05:00.000Z");

  h.setTime("2026-09-17T07:10:00.000Z");
  const successfulRefresh = controller.refresh();
  h.requests.at(-1).resolve(payload("refreshed"));
  await successfulRefresh;
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T07:10:00.000Z");

  h.setTime("2026-09-17T08:15:00.000Z");
  const failedRefresh = controller.refresh();
  h.requests.at(-1).reject(new Error("Refresh failed"));
  await failedRefresh;
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T07:10:00.000Z");
  assert.equal(h.latest().dashboard.activities[0].id, "refreshed");

  h.setTime("2026-09-17T09:20:00.000Z");
  const staleRefresh = controller.refresh();
  const staleRequest = h.requests.at(-1);
  const latestRequest = h.document.emit("pc-dashboard-filter-change", {
    filters: { status: "failed" },
  });
  const acceptedRequest = h.requests.at(-1);
  acceptedRequest.resolve(payload("latest"));
  await latestRequest;
  await new Promise((resolve) => setImmediate(resolve));

  h.setTime("2026-09-17T10:25:00.000Z");
  staleRequest.resolve(payload("stale"));
  await staleRefresh;
  assert.equal(h.latest().dashboard.activities[0].id, "latest");
  assert.equal(h.latest().lastSuccessfulLoadAt.toISOString(), "2026-09-17T09:20:00.000Z");

  controller.destroy();
});
