import test from "node:test";
import assert from "node:assert/strict";
import { createLiveAssignmentServices } from "./liveAssignmentServices.js";
import { createAssignmentSession } from "../state/createAssignmentSession.js";

function fixture() {
  let bindings = [
    { id: "b-a", packageId: "p", pipelineId: "a", workspaces: [{ id: "w", name: "Area" }] },
  ];
  const calls = [];
  const catalogue = {
    async package(id) {
      return { id, category: "cat" };
    },
    async bindings() {
      calls.push("read");
      return structuredClone(bindings);
    },
    async bind(packageId, pipelineId) {
      calls.push(`add:${pipelineId}`);
      if (pipelineId === "fail") throw new Error("Denied");
      bindings.push({ id: `b-${pipelineId}`, packageId, pipelineId, workspaces: [] });
    },
    async unbind(id) {
      calls.push(`remove:${id}`);
      bindings = bindings.filter((item) => item.id !== id);
    },
  };
  return { catalogue, calls, services: createLiveAssignmentServices(catalogue) };
}

test("independent deltas report partial failure and reconcile authoritative bindings", async () => {
  const { services, calls } = fixture();
  await assert.rejects(
    services.assignments.save("p", { activeIds: ["b", "b", "fail"], comments: [] }),
    (error) => {
      assert.deepEqual(Object.keys(error.record.relations), ["b"]);
      assert.deepEqual(
        error.outcomes.map((item) => [item.action, item.pipelineId, item.ok]),
        [
          ["Add", "b", true],
          ["Add", "fail", false],
          ["Remove", "a", true],
        ]
      );
      assert.match(error.message, /succeeded/);
      assert.match(error.message, /Denied/);
      return true;
    }
  );
  assert.deepEqual(calls, ["read", "add:b", "add:fail", "remove:b-a", "read"]);
});

test("session preserves failed intention but uses reconciled record for dirty state and retry", async () => {
  const { services, calls } = fixture();
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("a", false);
  session.setAssigned("b", true);
  session.setAssigned("fail", true);
  assert.equal(await session.save(), false);
  assert.deepEqual(Object.keys(session.snapshot().record.relations), ["b"]);
  assert.deepEqual(session.snapshot().draft.activeIds, ["b", "fail"]);
  assert.equal(session.snapshot().dirty, true);
  session.setAssigned("fail", false);
  session.setAssigned("c", true);
  assert.equal(await session.save(), true);
  assert.equal(calls.filter((call) => call === "add:b").length, 1);
  assert.equal(session.snapshot().dirty, false);
});

test("duplicate Save uses one in-flight operation and exact returned binding IDs", async () => {
  const { services, calls } = fixture();
  const draft = { activeIds: ["b"], comments: [] };
  const first = services.assignments.save("p", draft);
  const second = services.assignments.save("p", draft);
  assert.equal(first, second);
  await first;
  assert.equal(calls.filter((item) => item === "add:b").length, 1);
  assert.ok(calls.includes("remove:b-a"));
});

test("failed reconciliation retains draft; retry re-reads without duplicate successful writes", async () => {
  const { services, catalogue, calls } = fixture();
  const read = catalogue.bindings;
  let count = 0;
  catalogue.bindings = async () => {
    if (++count === 2) throw new Error("offline");
    return read();
  };
  await assert.rejects(
    services.assignments.save("p", { activeIds: ["b"], comments: [] }),
    (error) => error.record === null && error.message.includes("reload failed")
  );
  await services.assignments.save("p", { activeIds: ["b"], comments: [] });
  assert.equal(calls.filter((item) => item === "add:b").length, 1);
});

test("live assignment rejects comments and unsupported search without performing writes or page filtering", async () => {
  const { services, calls } = fixture();
  await assert.rejects(
    services.assignments.save("p", { activeIds: [], comments: [{ text: "demo" }] }),
    /cannot be saved by this API/
  );
  await assert.rejects(services.features.search({ search: "NM" }), /not supported/);
  assert.deepEqual(calls, []);
});

test("destroyed session cannot publish a completed live save", async () => {
  const { services } = fixture();
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("b", true);
  const saving = session.save();
  session.destroy();
  assert.equal(await saving, false);
  assert.equal((await services.assignments.load("p")).relations.b.active, true);
});

test("live Package search sends category and binding filters rather than filtering a page locally", async () => {
  let query;
  const services = createLiveAssignmentServices({
    packages: async (value) => {
      query = value;
      return { items: [{ id: "p", category: "cat" }], total: 150, page: 1, pageSize: 25 };
    },
  });
  const result = await services.features.search({
    page: 1,
    pageSize: 25,
    type: "cat",
    status: "Not assigned",
  });
  assert.equal(query.category, "cat");
  assert.equal(query.hasPipeline, false);
  assert.equal(result.total, 150);
  assert.equal(result.items[0].status, null);
  assert.equal(result.items[0].pipelineIds, null);
});

test("a response failure after the backend committed is reconciled and never silently called Saved", async () => {
  const { services, catalogue, calls } = fixture();
  const bind = catalogue.bind;
  catalogue.bind = async (...args) => {
    await bind(...args);
    throw new Error("Response interrupted");
  };
  await assert.rejects(
    services.assignments.save("p", { activeIds: ["a", "b"], comments: [] }),
    (error) => {
      assert.equal(error.record.relations.b.active, true);
      assert.match(error.message, /Requested bindings are now present/);
      return true;
    }
  );
  await services.assignments.save("p", { activeIds: ["a", "b"], comments: [] });
  assert.equal(calls.filter((item) => item === "add:b").length, 1);
});

function heldRequest() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("stalled binding preflight settles without writes and leaves the draft retryable", async () => {
  const { catalogue, calls } = fixture();
  const services = createLiveAssignmentServices(catalogue, { bindingRequestTimeoutMs: 12 });
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("b", true);
  const originalRead = catalogue.bindings;
  const pending = heldRequest();
  catalogue.bindings = () => pending.promise;
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().saving, false);
  assert.equal(session.snapshot().dirty, true);
  assert.equal(session.snapshot().reconciliationRequired, false);
  assert.equal(calls.filter((call) => call.startsWith("add:")).length, 0);
  catalogue.bindings = originalRead;
  assert.equal(await session.save(), true);
  pending.resolve([]);
});

test("uncertain timed-out mutation stops the batch and requires read-only verification", async () => {
  const { catalogue, calls } = fixture();
  const services = createLiveAssignmentServices(catalogue, { bindingRequestTimeoutMs: 12 });
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("b", true);
  session.setAssigned("a", false);
  let signal;
  const heldWrite = heldRequest();
  catalogue.bind = (_id, _pipelineId, options) => {
    calls.push("add:b");
    signal = options.signal;
    return heldWrite.promise;
  };

  assert.equal(await session.save(), false);
  assert.equal(signal.aborted, true);
  assert.equal(session.snapshot().saving, false);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.deepEqual(session.snapshot().draft.activeIds, ["b"]);
  assert.equal(await session.save(), false);
  assert.equal(await session.select("another"), false);
  assert.equal(calls.filter((call) => call === "add:b").length, 1);
  assert.equal(
    calls.some((call) => call.startsWith("remove:")),
    false
  );

  assert.equal(await session.reconcile(), true);
  assert.equal(session.snapshot().reconciliationRequired, false);
  assert.deepEqual(session.snapshot().draft.activeIds, ["b"]);
  assert.deepEqual(Object.keys(session.snapshot().record.relations), ["a"]);
  assert.match(session.snapshot().error, /timed-out request may still complete/);
  heldWrite.resolve();
});

test("post-write reconciliation deadline retains draft and blocks another mutation", async () => {
  const { catalogue, calls } = fixture();
  const services = createLiveAssignmentServices(catalogue, { bindingRequestTimeoutMs: 12 });
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("b", true);
  const originalRead = catalogue.bindings;
  const heldRead = heldRequest();
  let reads = 0;
  catalogue.bindings = (...args) => (++reads === 2 ? heldRead.promise : originalRead(...args));

  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.equal(await session.save(), false);
  assert.equal(calls.filter((call) => call === "add:b").length, 1);
  assert.equal(await session.reconcile(), true);
  assert.equal(session.snapshot().reconciliationRequired, false);
  assert.equal(session.snapshot().dirty, false);
  heldRead.resolve([]);
});

test("binding response body is included in the deadline and aborts transport", async () => {
  const { createCatalogueClient } = await import("../../../shared/api/catalogueClient.js");
  const { createCatalogueService } = await import("../../../shared/api/catalogueService.js");
  const body = heldRequest();
  let signal;
  const client = createCatalogueClient({
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return {
        status: 200,
        ok: true,
        headers: { get: () => "application/json" },
        text: () => body.promise,
      };
    },
  });
  const services = createLiveAssignmentServices(createCatalogueService(client), {
    bindingRequestTimeoutMs: 12,
  });
  await assert.rejects(services.assignments.load("p"), /timed out/);
  assert.equal(signal.aborted, true);
  body.resolve("[]");
});

test("an explicit local abandonment unlocks navigation without claiming server rollback", async () => {
  const { catalogue, calls } = fixture();
  const services = createLiveAssignmentServices(catalogue, { bindingRequestTimeoutMs: 12 });
  const session = createAssignmentSession({ services });
  await session.select("p");
  session.setAssigned("b", true);
  const held = heldRequest();
  catalogue.bind = () => held.promise;
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.equal(session.discard(), undefined);
  assert.equal(session.snapshot().dirty, true);
  assert.equal(session.abandonUncertainDraft(), true);
  assert.equal(session.snapshot().feature, null);
  assert.equal(session.snapshot().reconciliationRequired, false);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(calls.filter((call) => call.startsWith("remove:")).length, 0);
  held.resolve();
});

test("Workspace preview mutations are rejected before any network writes", async () => {
  const { services, calls } = fixture();
  await assert.rejects(
    services.assignments.save("p", {
      activeIds: ["a"],
      comments: [],
      workspaceOverrides: { a: { "not-automatched": true } },
    }),
    /preview-only/
  );
  assert.deepEqual(calls, []);
});

test("Workspace selection catalogue collects every page for the requested Pipeline", async () => {
  const requests = [];
  const services = createLiveAssignmentServices({
    workspaces: async (query) => {
      requests.push(query);
      return {
        page: query.page,
        pageSize: query.pageSize,
        total: 201,
        items: Array.from({ length: query.page === 0 ? 200 : 1 }, (_, i) => ({
          id: `w${query.page * 200 + i}`,
          key: JSON.stringify(["p", `w${query.page * 200 + i}`]),
          name: `Workspace ${query.page * 200 + i}`,
          pipelineId: "p",
        })),
      };
    },
  });
  const result = await services.workspaces.list({ pipelineId: "p" });
  assert.equal(result.items.length, 201);
  assert.deepEqual(
    requests.map((value) => [value.pipelineId, value.page, value.pageSize]),
    [
      ["p", 0, 200],
      ["p", 1, 200],
    ]
  );
});

test("Workspace selection catalogue rejects cross-Pipeline entries", async () => {
  const services = createLiveAssignmentServices({
    workspaces: async () => ({
      page: 0,
      pageSize: 200,
      total: 1,
      items: [{ id: "w", key: "other/w", name: "Not in requested Pipeline", pipelineId: "other" }],
    }),
  });
  await assert.rejects(services.workspaces.list({ pipelineId: "p" }), /different Pipeline scope/);
});

test("unfiltered Package pages never invent assignment status or bindings", async () => {
  const services = createLiveAssignmentServices({
    packages: async () => ({
      items: [{ id: "p", category: "cat" }],
      total: 1,
      page: 0,
      pageSize: 25,
    }),
  });
  const result = await services.features.search({});
  assert.equal(result.items[0].status, null);
  assert.equal(result.items[0].pipelineIds, null);
});

test("Package pages never fan out into binding reads before selection", async () => {
  const calls = [];
  const services = createLiveAssignmentServices({
    packages: async () => {
      calls.push("packages");
      return {
        items: Array.from({ length: 25 }, (_, index) => ({ id: `pkg-${index}` })),
        page: 0,
        pageSize: 25,
        total: 25,
      };
    },
    pipelines: async () => {
      calls.push("pipelines");
      return [];
    },
    bindings: async (id) => {
      calls.push(`bindings:${id}`);
      return id === "pkg-0" ? [{ id: "binding-0", pipelineId: "enc", workspaces: [] }] : [];
    },
  });
  const listing = await services.features.search({});
  assert.equal(listing.items.length, 25);
  assert.deepEqual(calls, ["packages"]);
  assert.equal(services.features.bindingSummaries, undefined);
  const chosen = await services.assignments.load("pkg-0");
  assert.deepEqual(Object.keys(chosen.relations), ["enc"]);
  assert.deepEqual(calls, ["packages", "bindings:pkg-0"]);
});

test("Package binding reads remain isolated to the requested identity", async () => {
  const calls = [];
  const services = createLiveAssignmentServices({
    bindings: async (id, { signal }) => {
      calls.push({ id, signal });
      return [{ id: `binding-${id}`, pipelineId: "enc", workspaces: [] }];
    },
  });
  const controller = new AbortController();
  const record = await services.assignments.load("pkg-7", { signal: controller.signal });
  assert.deepEqual(Object.keys(record.relations), ["enc"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "pkg-7");
  assert.ok(calls[0].signal instanceof AbortSignal);
});

test("unfiltered Package lists use each backend assignment summary without binding fan-out", async () => {
  let called = 0;
  const services = createLiveAssignmentServices({
    async packages() {
      called++;
      return {
        items: [
          { id: "p1", status: "Assigned", pipelineIds: ["ENC", "Paper"] },
          { id: "p2", status: "Not assigned", pipelineIds: [] },
          { id: "p3", status: null, pipelineIds: null },
        ],
        page: 0,
        pageSize: 25,
        total: 3,
      };
    },
    async bindings() {
      throw new Error("List rendering must not fetch per-Package bindings");
    },
  });
  const page = await services.features.search();
  assert.equal(called, 1);
  assert.deepEqual(
    page.items.map((item) => [item.status, item.pipelineIds]),
    [
      ["Assigned", ["ENC", "Paper"]],
      ["Not assigned", []],
      [null, null],
    ]
  );
});
