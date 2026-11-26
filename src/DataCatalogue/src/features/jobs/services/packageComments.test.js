import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createCatalogueService } from "../../../shared/api/catalogueService.js";
import { bindingCommentKey } from "../../../shared/api/bindingComments.js";
import { createCatalogueClient } from "../../../shared/api/catalogueClient.js";
import { createPackageCommentAvailability } from "./createPackageCommentAvailability.js";
import { createPackageCommentViewerLoader } from "./createPackageCommentViewerLoader.js";

const active = { visible: true, busy: false };
const inactive = { visible: false, busy: false };
const binding = (packageId, pipelineId = "enc") => ({ packageId, pipelineId });
const job = (packageId, pipelineId) => ({ ...binding(packageId, pipelineId), source: "live" });
const guid = (index) => `a0000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
const present = (pairs) => new Map(pairs.map((pair) => [bindingCommentKey(pair), true]));

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

test("Availability uses bounded batches across all unique live bindings, independent of repeated contexts", async (t) => {
  for (const [count, expected] of [
    [0, []],
    [1, [1]],
    [34, [34]],
    [200, [200]],
    [201, [200, 1]],
    [401, [200, 200, 1]],
  ]) {
    await t.test(
      `${count} bindings: ${expected.length} availability, 0 comment or profile calls`,
      async () => {
        const calls = [];
        let running = 0;
        let maxRunning = 0;
        const catalogue = createCatalogueService(
          createCatalogueClient({
            async fetchImpl(path, options) {
              assert.equal(path, "/v1/packages/binding-comments/availability");
              assert.equal(options.method, "POST");
              assert.equal(options.credentials, "same-origin");
              assert.ok(options.signal instanceof AbortSignal);
              const { bindings } = JSON.parse(options.body);
              calls.push(bindings.length);
              maxRunning = Math.max(maxRunning, ++running);
              await nextTurn();
              running--;
              return Response.json({
                items: bindings.map((pair) => ({ ...pair, hasBindingComments: true })),
              });
            },
          })
        );
        const comments = createPackageCommentAvailability({
          read: catalogue.bindingCommentAvailability,
          onChange() {},
        });
        const jobs = Array.from({ length: count }, (_, index) =>
          job(`package-${Math.floor(index / 3)}`, `pipeline-${index % 3}`)
        );
        comments.acceptJobs(1, [
          ...jobs,
          ...jobs.map((row) => ({ ...row, workspaceId: "other" })),
          { ...job("mock"), source: "mock" },
        ]);
        assert.deepEqual(calls, []);
        comments.setContext(active);
        comments.setContext(active);
        await nextTurn();
        await nextTurn();
        await nextTurn();
        assert.deepEqual(calls, expected);
        assert.ok(maxRunning <= 2);
        for (const row of jobs) assert.equal(comments.getStatus(row), "present");
        comments.acceptJobs(1, jobs);
        comments.setContext(inactive);
        comments.setContext(active);
        assert.deepEqual(calls, expected);
        comments.destroy();
      }
    );
  }
});

test("Availability distinguishes null, error and confirmed absence and rejects malformed coverage", async () => {
  let payload;
  const catalogue = createCatalogueService({ request: async () => payload });
  for (const items of [
    [],
    [{ ...binding("foreign"), hasBindingComments: false }],
    [{ ...binding("a"), hasBindingComments: "false" }],
    [binding("a")],
    [{ ...binding("a"), hasBindingComments: 0 }],
    [{ ...binding("a", "ENC"), hasBindingComments: true }],
    [
      { ...binding("a"), hasBindingComments: true },
      { ...binding("b"), hasBindingComments: true },
    ],
  ]) {
    payload = { items };
    await assert.rejects(catalogue.bindingCommentAvailability([binding("a")]));
  }
  payload = {
    items: [
      { ...binding("a"), hasBindingComments: false },
      { ...binding("a"), hasBindingComments: true },
    ],
  };
  await assert.rejects(catalogue.bindingCommentAvailability([binding("a"), binding("b")]));
  await assert.rejects(catalogue.bindingCommentAvailability([binding("a"), binding("a")]));
  await assert.rejects(catalogue.bindingCommentAvailability([binding(" padded")]));

  const comments = createPackageCommentAvailability({
    read: catalogue.bindingCommentAvailability,
    onChange() {},
  });
  comments.acceptJobs(1, [job("a"), job("b")]);
  comments.setContext(active);
  assert.equal(comments.getStatus(binding("a")), "loading");
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "error");
  comments.setContext(inactive);
  payload = {
    items: [
      { ...binding("a"), hasBindingComments: false },
      { ...binding("b"), hasBindingComments: null },
    ],
  };
  comments.setContext(active);
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "absent");
  assert.equal(comments.getStatus(binding("b")), "unknown");
});

test("Dirty comment return coalesces and an accepted membership publication replaces the dirty round", async () => {
  const calls = [];
  const comments = createPackageCommentAvailability({
    read: async (ids) => {
      calls.push(ids.map(bindingCommentKey));
      return present(ids);
    },
    onChange() {},
  });
  comments.acceptJobs(1, [job("a"), job("b"), job("a")]);
  comments.setContext(active);
  await nextTurn();
  comments.setContext(inactive);
  comments.invalidate(binding("b"));
  comments.invalidate(binding("b"));
  comments.invalidate(binding("off-map"));
  assert.equal(comments.getStatus(binding("b")), "unknown");
  comments.setContext(active);
  comments.setContext(active);
  await nextTurn();
  assert.deepEqual(
    calls,
    [["a", "b"], ["b"]].map((ids) => ids.map((id) => bindingCommentKey(binding(id))))
  );

  comments.setContext(inactive);
  comments.invalidate(binding("a"));
  comments.setContext({ visible: true, busy: true });
  comments.acceptJobs(2, [job("c"), job("b"), job("c")]);
  assert.equal(comments.getStatus(binding("a")), "unknown");
  comments.setContext(active);
  await nextTurn();
  assert.deepEqual(
    calls,
    [["a", "b"], ["b"], ["c", "b"]].map((ids) => ids.map((id) => bindingCommentKey(binding(id))))
  );
  comments.acceptJobs(3, [job("c"), job("b")]);
  await nextTurn();
  assert.deepEqual(
    calls.at(-1),
    ["c", "b"].map((id) => bindingCommentKey(binding(id)))
  );
});

test("Superseded, hidden and pre-mutation reads cannot publish stale availability", async () => {
  const requests = [];
  const comments = createPackageCommentAvailability({
    read(ids, { signal }) {
      const result = deferred();
      requests.push({ ...result, ids, signal });
      return result.promise;
    },
    onChange() {},
  });
  comments.acceptJobs(1, [job("a")]);
  comments.setContext(active);
  const staleObservation = comments.observeFirstPage(binding("a"));
  comments.invalidate(binding("a"));
  staleObservation(false);
  requests[0].resolve(new Map([[bindingCommentKey(binding("a")), false]]));
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "loading");
  const observation = comments.observeFirstPage(binding("a"));
  observation(true);
  requests[1].resolve(new Map([[bindingCommentKey(binding("a")), false]]));
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "present");

  comments.acceptJobs(2, [job("a")]);
  comments.setContext(inactive);
  assert.equal(requests[2].signal.aborted, true);
  requests[2].resolve(present([binding("a")]));
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "unknown");
  comments.setContext(active);
  comments.acceptJobs(3, [job("b")]);
  assert.equal(requests[3].signal.aborted, true);
  requests[4].resolve(present([binding("b")]));
  await nextTurn();
  assert.equal(comments.getStatus(binding("a")), "unknown");
  assert.equal(comments.getStatus(binding("b")), "present");
});

const item = (index, extra = {}) => ({
  id: guid(index),
  pipelineId: "enc",
  text: "<img src=x onerror=alert(1)>\nReview",
  actor: "PROD\\reader",
  occurredAtUtc: "2026-11-25T13:00:00.1234567+00:00",
  historyEventId: guid(index + 100),
  ...extra,
});

test("Viewer reads one page per intent, uses operation cursor and deduplicates profile lookups by actor", async () => {
  const calls = [];
  let olderAttempt = 0;
  const catalogue = createCatalogueService({
    async request(path, options) {
      calls.push({ path, ...options });
      if (path.endsWith("/profile"))
        return {
          actor: "PROD\\reader",
          displayName: "Reader",
          photoMediaType: null,
          photoBase64: null,
        };
      assert.equal(options.query.pipelineId, "enc");
      if (!options.query.before) {
        return {
          packageId: "a",
          pipelineId: "enc",
          items: Array.from({ length: 50 }, (_, index) => item(60 - index)),
          nextBefore: guid(11),
        };
      }
      assert.equal(options.query.before, guid(11));
      if (olderAttempt++ === 0) return { packageId: "foreign", items: [], nextBefore: null };
      return { ...binding("a"), items: [item(10)], nextBefore: null };
    },
  });
  const observed = [];
  let snapshot;
  const viewer = createPackageCommentViewerLoader({
    read: catalogue.bindingComments,
    readProfile: catalogue.packageHistoryProfile,
    observeFirstPage: (id) => (has) => observed.push([id, has]),
    onChange: (state) => {
      snapshot = state;
    },
  });
  const first = viewer.select(binding("a"));
  viewer.select(binding("a"));
  viewer.refresh();
  await first;
  await nextTurn();
  assert.equal(snapshot.entries.length, 50);
  assert.equal(snapshot.entries[0].profile.displayName, "Reader");
  assert.equal(snapshot.entries[0].text, item(60).text);
  assert.deepEqual(snapshot.entries[0].context, { scope: "binding", pipelineId: "enc" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].path, `/v1/packages/a/history/${guid(160)}/profile`);
  assert.deepEqual(observed, [[binding("a"), true]]);

  await viewer.loadOlder();
  assert.ok(snapshot.error);
  assert.equal(snapshot.entries.length, 50);
  await viewer.retry();
  assert.equal(snapshot.entries.length, 51);
  assert.equal(snapshot.error, null);
  assert.equal(calls.length, 4);
  await viewer.refresh();
  assert.equal(snapshot.entries.length, 50);
  assert.equal(calls.length, 6);
});

test("Viewer falls back to the recorded account and ignores old text after a same-Package binding switch", async () => {
  const requests = [];
  let profileCalls = 0;
  const viewer = createPackageCommentViewerLoader({
    read(packageId, { signal }) {
      const result = deferred();
      requests.push({ ...result, signal, packageId });
      return result.promise;
    },
    readProfile() {
      profileCalls++;
    },
    observeFirstPage: () => () => {},
    onChange() {},
  });
  const first = viewer.select(binding("a", "caris"));
  const second = viewer.select(binding("a"));
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ items: [item(1)], nextBefore: null });
  await first;
  const catalogue = createCatalogueService({
    async request() {
      return { ...binding("a"), items: [item(1, { historyEventId: guid(1) })], nextBefore: null };
    },
  });
  requests[1].resolve(await catalogue.bindingComments("a", { pipelineId: "enc" }));
  await second;
  assert.equal(viewer.getSnapshot().entries[0].actor, "reader");
  assert.equal(profileCalls, 0);
  const refresh = viewer.refresh();
  viewer.select(null);
  assert.equal(requests[2].signal.aborted, true);
  requests[2].resolve({ items: [item(2)], nextBefore: null });
  await refresh;
  assert.deepEqual(viewer.getSnapshot().entries, []);
});

test("Viewer rejects reordered or duplicated persisted entries without fabricating absence", async () => {
  const viewer = createPackageCommentViewerLoader({
    read: async () => ({ items: [item(1), item(2)], nextBefore: null }),
    observeFirstPage: () => () => assert.fail("Invalid order cannot establish presence"),
    onChange() {},
  });
  await viewer.select(binding("a"));
  assert.match(viewer.getSnapshot().error, /changed during paging/);
  assert.equal(viewer.getSnapshot().loaded, false);
});

test("Unsupported, denied and failed availability reads remain errors without automatic retries", async () => {
  for (const status of [401, 403, 404, 503]) {
    let calls = 0;
    const catalogue = createCatalogueService(
      createCatalogueClient({
        async fetchImpl() {
          calls++;
          return Response.json({ title: "Fixture error" }, { status });
        },
      })
    );
    const comments = createPackageCommentAvailability({
      read: catalogue.bindingCommentAvailability,
      onChange() {},
    });
    comments.setContext(active);
    comments.acceptJobs(1, [job("a")]);
    await nextTurn();
    comments.setContext(active);
    comments.acceptJobs(1, [job("a")]);
    assert.equal(calls, 1);
    assert.equal(comments.getStatus(binding("a")), "error");
    comments.destroy();
  }
});

test("Profiles run at most four at once and do not publish after closing the viewer", async () => {
  const enrichments = [];
  const viewer = createPackageCommentViewerLoader({
    read: async () => ({
      items: Array.from({ length: 11 }, (_, index) =>
        item(11 - index, { actor: `PROD\\reader${index}` })
      ),
      nextBefore: null,
    }),
    readProfile(_id, _eventId, { signal }) {
      const request = deferred();
      enrichments.push({ ...request, signal });
      return request.promise;
    },
    observeFirstPage: () => () => {},
    onChange() {},
  });
  await viewer.select(binding("a"));
  assert.equal(enrichments.length, 4);
  enrichments[0].resolve({ displayName: "First", photoSrc: null });
  await nextTurn();
  assert.equal(enrichments.length, 5);
  viewer.select(null);
  assert.ok(enrichments.every(({ signal }) => signal.aborted));
  for (const { resolve } of enrichments) resolve({ displayName: "Late", photoSrc: null });
  await nextTurn();
  assert.equal(enrichments.length, 5);
  assert.deepEqual(viewer.getSnapshot().entries, []);
});

test("A scoped read rejects a foreign item, foreign scope or legacy unscoped empty result", async () => {
  let payload;
  const catalogue = createCatalogueService({
    async request(_path, options) {
      assert.equal(options.query.pipelineId, "enc");
      return payload;
    },
  });
  for (const invalid of [
    { packageId: "a", items: [], nextBefore: null },
    { ...binding("a", "caris"), items: [], nextBefore: null },
    { ...binding("a"), items: [item(1, { pipelineId: "caris" })], nextBefore: null },
  ]) {
    payload = invalid;
    await assert.rejects(catalogue.bindingComments("a", { pipelineId: "enc" }));
  }
  payload = { ...binding("a"), items: [], nextBefore: null };
  assert.deepEqual(await catalogue.bindingComments("a", { pipelineId: "enc" }), {
    items: [],
    nextBefore: null,
  });
});

test("An in-flight CARIS profile cannot enrich ENC or acknowledge its availability", async () => {
  const response = deferred();
  const observations = [];
  let profileSignal;
  const loader = createPackageCommentViewerLoader({
    read: async (_id, { pipelineId }) => ({
      items: pipelineId === "caris" ? [item(1, { pipelineId })] : [],
      nextBefore: null,
    }),
    readProfile(_id, _eventId, { signal }) {
      profileSignal = signal;
      return response.promise;
    },
    observeFirstPage: (pair) => (hasComments) => observations.push([pair, hasComments]),
    onChange() {},
  });
  await loader.select(binding("a", "caris"));
  await loader.select(binding("a"));
  assert.equal(profileSignal.aborted, true);
  response.resolve({ displayName: "Late", photoSrc: null });
  await nextTurn();
  assert.deepEqual(loader.getSnapshot().entries, []);
  assert.deepEqual(observations, [
    [binding("a", "caris"), true],
    [binding("a"), false],
  ]);
});

test("Binding tuple keys remain case-sensitive and distinguish delimiter collisions", async () => {
  const requested = [binding("a:", "enc"), binding("a", ":enc"), binding("a:", "ENC")];
  const catalogue = createCatalogueService({
    async request() {
      return {
        items: requested.map((pair, index) => ({
          ...pair,
          hasBindingComments: [true, false, null][index],
        })),
      };
    },
  });
  const results = await catalogue.bindingCommentAvailability(requested);
  assert.deepEqual(
    requested.map((pair) => results.get(bindingCommentKey(pair))),
    [true, false, null]
  );
});
