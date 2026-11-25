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

test("History displays the recorded Windows account, preserves its full identity, and distinguishes System and legacy events", async () => {
  const loader = createPackageHistoryLoader({
    async read() {
      return result([
        event("user", undefined, { actor: "PROD\\B123456" }),
        event("other-domain", undefined, { actor: "OTHER\\B123456" }),
        event("unqualified", undefined, { actor: "B654321" }),
        event("system", undefined, { actor: "System" }),
        event("legacy"),
      ]);
    },
  });
  loader.select("package");
  await Promise.resolve();
  assert.deepEqual(
    loader.getSnapshot().entries.map(({ actor, actorIdentity }) => [actor, actorIdentity]),
    [
      ["B123456", "PROD\\B123456"],
      ["B123456", "OTHER\\B123456"],
      ["B654321", "B654321"],
      ["System", "System"],
      ["Actor not recorded", null],
    ]
  );
});

const flushProfiles = () => new Promise((resolve) => setImmediate(resolve));

test("History displays immediately and enriches each full Windows account only once per selection", async () => {
  const calls = [];
  const request = deferred();
  const loader = createPackageHistoryLoader({
    async read(_id, { before }) {
      if (before) {
        return result([event("older", "2026-01-14T10:00:00Z", { actor: "PROD\\B123456" })]);
      }
      return result(
        [
          event("first", undefined, { actor: "PROD\\B123456" }),
          event("second", undefined, { actor: "prod\\b123456" }),
          event("other", undefined, { actor: "OTHER\\B123456" }),
          event("system", undefined, { actor: "System" }),
          event("legacy"),
          event("unqualified", undefined, { actor: "B123456" }),
        ],
        "unqualified"
      );
    },
    readProfile(id, eventId, options) {
      calls.push({ id, eventId, options });
      if (eventId === "other") return Promise.reject(new Error("Unavailable"));
      return request.promise;
    },
  });
  loader.select("package");
  await flushProfiles();
  assert.equal(loader.getSnapshot().hasLoaded, true);
  assert.equal(loader.getSnapshot().isLoading, false);
  assert.equal(loader.getSnapshot().entries[0].actor, "B123456");
  assert.equal(loader.getSnapshot().entries[0].profile, undefined);
  assert.deepEqual(
    calls.map(({ eventId }) => eventId),
    ["first", "other"]
  );
  request.resolve({ displayName: "Example user", photoSrc: null });
  await flushProfiles();
  assert.equal(loader.getSnapshot().entries[0].profile.displayName, "Example user");
  assert.equal(loader.getSnapshot().entries[1].profile.displayName, "Example user");
  assert.equal(loader.getSnapshot().entries[2].profile, undefined);
  assert.equal(loader.getSnapshot().error, null);
  await loader.loadOlder();
  assert.equal(loader.getSnapshot().entries.at(-1).profile.displayName, "Example user");
  assert.equal(calls.length, 2);
  loader.destroy();
});

test("Profile completions after selection, refresh or disposal cannot publish stale actors", async () => {
  const calls = [];
  const published = [];
  const loader = createPackageHistoryLoader({
    async read(id) {
      return result([event(id, undefined, { actor: "PROD\\B123456" })]);
    },
    readProfile(id, eventId, options) {
      const request = deferred();
      calls.push({ id, eventId, options, ...request });
      return request.promise;
    },
    onChange: (snapshot) => published.push(snapshot),
  });
  loader.select("A");
  await flushProfiles();
  loader.select("B");
  await flushProfiles();
  assert.equal(calls[0].options.signal.aborted, true);
  calls[0].resolve({ displayName: "Stale A" });
  await flushProfiles();
  assert.equal(loader.getSnapshot().entries[0].profile, undefined);
  await loader.refresh();
  assert.equal(calls[1].options.signal.aborted, true);
  calls[1].resolve({ displayName: "Stale B" });
  calls[2].resolve({ displayName: "Current B" });
  await flushProfiles();
  assert.equal(loader.getSnapshot().entries[0].profile.displayName, "Current B");
  await loader.refresh();
  loader.destroy();
  assert.equal(calls[3].options.signal.aborted, true);
  const count = published.length;
  calls[3].resolve({ displayName: "Disposed" });
  await flushProfiles();
  assert.equal(published.length, count);
});

test("Profile requests are limited to four concurrent reads and Refresh retries unavailable profiles", async () => {
  const calls = [];
  const loader = createPackageHistoryLoader({
    async read() {
      return result(
        Array.from({ length: 5 }, (_, index) =>
          event(`event-${index}`, undefined, { actor: `PROD\\B${index}` })
        )
      );
    },
    readProfile(_id, eventId) {
      const request = deferred();
      calls.push({ eventId, ...request });
      return request.promise;
    },
  });
  loader.select("package");
  await flushProfiles();
  assert.equal(calls.length, 4);
  calls[0].resolve(null);
  await flushProfiles();
  assert.equal(calls.length, 5);
  for (const call of calls.slice(1)) call.resolve(null);
  await flushProfiles();
  assert.equal(loader.getSnapshot().error, null);
  await loader.refresh();
  assert.equal(calls.length, 9);
  loader.destroy();
  for (const call of calls.slice(5)) call.resolve(null);
});
