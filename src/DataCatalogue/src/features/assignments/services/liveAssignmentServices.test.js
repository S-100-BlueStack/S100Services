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
    /demo mode/
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
  assert.equal(result.items[0].status, "Not assigned");
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
