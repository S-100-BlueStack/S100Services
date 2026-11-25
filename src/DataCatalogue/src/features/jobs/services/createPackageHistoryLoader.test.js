import assert from "node:assert/strict";
import test from "node:test";
import { createPackageHistoryLoader } from "./createPackageHistoryLoader.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function event(id, occurredAtUtc = "2026-01-15T14:35:00Z", extras = {}) {
  return {
    id,
    occurredAtUtc,
    eventType: "packageCreated",
    actor: null,
    pipelineId: null,
    pipelineName: null,
    severity: null,
    ...extras,
  };
}
function result(items = [], nextBefore = null) {
  return { items, nextBefore };
}

test("History selection aborts superseded and disposed requests even if the transport ignores cancellation", async () => {
  const calls = [];
  const published = [];
  const loader = createPackageHistoryLoader({
    read(id, options) {
      const request = deferred();
      calls.push({ id, options, ...request });
      return request.promise;
    },
    onChange: (snapshot) => published.push(snapshot),
  });
  loader.select("A");
  loader.select("A");
  assert.equal(calls.length, 1);
  loader.select("B");
  assert.equal(calls[0].options.signal.aborted, true);
  calls[1].resolve(result([event("B")]));
  await Promise.resolve();
  calls[0].resolve(result([event("A")]));
  await Promise.resolve();
  assert.equal(loader.getSnapshot().entries[0].id, "B");
  loader.select("C");
  loader.select(null);
  assert.equal(calls[2].options.signal.aborted, true);
  calls[2].resolve(result([event("C")]));
  await Promise.resolve();
  assert.equal(loader.getSnapshot().packageId, null);
  loader.select("D");
  loader.destroy();
  assert.equal(calls[3].options.signal.aborted, true);
  const count = published.length;
  calls[3].reject(new Error("late failure"));
  await Promise.resolve();
  assert.equal(published.length, count);
});

test("History continuation is single-flight, errors retain prior events, and retry resumes the same cursor", async () => {
  const calls = [];
  const loader = createPackageHistoryLoader({
    async read(id, { before }) {
      calls.push([id, before]);
      if (calls.length === 1) return result([event("new")], "new");
      if (calls.length === 2) throw new Error("Network unavailable");
      if (calls.length === 3)
        return result([
          event("old", "2026-01-14T10:00:00Z", {
            eventType: "severityUpdated",
            severity: "18446744073709551615",
          }),
        ]);
      return result();
    },
  });
  loader.select("package");
  await Promise.resolve();
  const pending = loader.loadOlder();
  void loader.loadOlder();
  await pending;
  assert.match(loader.getSnapshot().error, /Network/);
  assert.equal(loader.getSnapshot().entries.length, 1);
  await loader.retry();
  assert.deepEqual(calls, [
    ["package", null],
    ["package", "new"],
    ["package", "new"],
  ]);
  assert.equal(loader.getSnapshot().error, null);
  assert.equal(loader.getSnapshot().entries[1].context, "Not prioritized");
  assert.equal(loader.getSnapshot().entries[0].actor, "Actor not recorded");
  assert.equal(loader.getSnapshot().nextBefore, null);
  await loader.refresh();
  assert.equal(loader.getSnapshot().hasLoaded, true);
  assert.deepEqual(loader.getSnapshot().entries, []);
});

test("Duplicate event identities across pages fail instead of showing duplicated history", async () => {
  const loader = createPackageHistoryLoader({
    async read() {
      return result([event("same")], "same");
    },
  });
  loader.select("package");
  await Promise.resolve();
  await loader.loadOlder();
  assert.match(loader.getSnapshot().error, /changed during paging/);
  assert.equal(loader.getSnapshot().entries.length, 1);
  assert.equal(loader.getSnapshot().nextBefore, "same");
});
