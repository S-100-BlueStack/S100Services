import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function createHarness() {
  const source = await readFile(new URL("dashboardPage.js", import.meta.url), "utf8");
  const lookups = [];
  const historyRequests = [];
  const notices = [];
  // Run the original History controller; only its imported service and DOM-render boundaries are mocked.
  const controller = runInNewContext(
    source
      .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
      .replace("export function", "function") +
      "\n({ openDashboardHistory, closeDashboardHistory, getState: () => dashboardHistoryState });",
    {
      Error,
      createDefaultDashboardFilters: () => ({}),
      loadStatuses() {
        const request = deferred();
        lookups.push(request);
        return request.promise;
      },
      fetchProductHistory(datasetName) {
        const request = deferred();
        historyRequests.push({ datasetName, ...request });
        return request.promise;
      },
      noticeError: (...args) => notices.push(args),
    }
  );

  return { ...controller, lookups, historyRequests, notices };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

function historyFor(datasetName) {
  return { datasetName, events: [], endpointAvailable: true };
}

test("a failed first History lookup can be retried on a later user open", async () => {
  const h = await createHarness();
  const first = h.openDashboardHistory("A");
  assert.equal(h.lookups.length, 1);
  h.lookups[0].reject(new Error("Lookup unavailable"));
  await first;
  assert.equal(h.getState().loading, false);
  assert.equal(h.getState().error.message, "Lookup unavailable");
  assert.equal(h.notices.length, 1);
  assert.equal(h.historyRequests.length, 0);

  h.closeDashboardHistory();
  const second = h.openDashboardHistory("B");
  assert.equal(h.lookups.length, 2);
  h.lookups[1].resolve();
  await flush();
  assert.deepEqual(
    h.historyRequests.map((request) => request.datasetName),
    ["B"]
  );
  h.historyRequests[0].resolve(historyFor("B"));
  await second;
  assert.equal(h.getState().datasetName, "B");
  assert.equal(h.getState().history.datasetName, "B");
  assert.equal(h.getState().error, null);
  assert.equal(h.notices.length, 1);
});

test("concurrent opens share pending lookups, latest choice owns History, success remains cached", async () => {
  const h = await createHarness();
  const first = h.openDashboardHistory("A");
  const second = h.openDashboardHistory("B");
  assert.equal(h.lookups.length, 1);

  h.lookups[0].resolve();
  await flush();
  assert.deepEqual(
    h.historyRequests.map((request) => request.datasetName),
    ["B"]
  );
  h.historyRequests[0].resolve(historyFor("B"));
  await Promise.all([first, second]);
  assert.equal(h.getState().history.datasetName, "B");

  const third = h.openDashboardHistory("C");
  await flush();
  assert.equal(h.lookups.length, 1);
  assert.deepEqual(
    h.historyRequests.map((request) => request.datasetName),
    ["B", "C"]
  );
  h.historyRequests[1].resolve(historyFor("C"));
  await third;
  assert.equal(h.getState().history.datasetName, "C");
  assert.equal(h.notices.length, 0);
});

test("a lookup failure after close does not show a stale error or poison the next attempt", async () => {
  const h = await createHarness();
  const first = h.openDashboardHistory("A");
  h.closeDashboardHistory();
  h.lookups[0].reject(new Error("Old lookup failed"));
  await first;
  assert.equal(h.getState().isOpen, false);
  assert.equal(h.notices.length, 0);

  const second = h.openDashboardHistory("B");
  assert.equal(h.lookups.length, 2);
  h.lookups[1].resolve();
  await flush();
  h.historyRequests[0].resolve(historyFor("B"));
  await second;
  assert.equal(h.getState().history.datasetName, "B");
  assert.equal(h.notices.length, 0);
});

test("closing or changing selection while History is pending suppresses stale results and notices", async () => {
  const h = await createHarness();
  const first = h.openDashboardHistory("A");
  h.lookups[0].resolve();
  await flush();
  assert.equal(h.historyRequests.length, 1);

  const second = h.openDashboardHistory("B");
  await flush();
  assert.equal(h.historyRequests.length, 2);
  h.historyRequests[0].reject(new Error("Stale A failure"));
  await first;
  assert.equal(h.getState().datasetName, "B");
  assert.equal(h.notices.length, 0);
  h.closeDashboardHistory();
  h.historyRequests[1].resolve(historyFor("B"));
  await second;
  assert.equal(h.getState().isOpen, false);
  assert.equal(h.getState().history, null);
  assert.equal(h.notices.length, 0);
});
