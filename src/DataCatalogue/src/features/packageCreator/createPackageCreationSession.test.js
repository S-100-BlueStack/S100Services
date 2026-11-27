import assert from "node:assert/strict";
import test from "node:test";
import { createPackageCreationSession } from "./createPackageCreationSession.js";

test("a pending or unknown create owns one attempt and keeps its submitted evidence", async () => {
  let settle;
  const payload = { category: "WorkZone", absoluteUri: "urn:example:case", esriJSON: "{}" };
  const states = [];
  const changes = [];
  const calls = [];
  const session = createPackageCreationSession({
    service: {
      create(request) {
        calls.push(request);
        return new Promise((resolve) => {
          settle = resolve;
        });
      },
      async reconcile(id, request) {
        assert.equal(id, "known");
        assert.equal(request, payload);
        return { id, pipelineIds: [] };
      },
    },
    onState: (state) => states.push(state.status),
    onCatalogueChange: (change) => changes.push(change),
  });
  const result = session.submit(payload);
  await session.submit(payload);
  assert.equal(session.reset({ abandon: true }), false);
  settle({ status: "unknown", knownId: "known" });
  await result;
  await session.submit(payload);
  assert.equal(session.reset(), false);
  assert.deepEqual(calls, [payload]);
  assert.deepEqual(changes, [{ membership: true }]);
  await session.reconcile();
  assert.equal(session.snapshot().status, "confirmed");
  assert.deepEqual(changes, [{ membership: true }, { membership: false }]);
  assert.deepEqual(states, ["pending", "unknown", "unknown", "confirmed"]);
});

test("definite rejection keeps the form usable, and only bound success marks membership", async () => {
  for (const pipelineIds of [[], ["S101"]]) {
    const changes = [];
    let response = { status: "rejected", message: "Invalid category" };
    const session = createPackageCreationSession({
      service: {
        async create() {
          return response;
        },
      },
      onState() {},
      onCatalogueChange: (change) => changes.push(change),
    });
    await session.submit({});
    assert.equal(session.snapshot().status, "rejected");
    assert.deepEqual(changes, []);
    response = { status: "confirmed", item: { pipelineIds } };
    await session.submit({});
    assert.deepEqual(changes, [{ membership: pipelineIds.length > 0 }]);
    assert.equal(session.reset(), true);
  }
});

test("late create completion after teardown does not publish into the disposed UI", async () => {
  let finish;
  const states = [];
  const session = createPackageCreationSession({
    service: {
      create: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    onState: (state) => states.push(state.status),
    onCatalogueChange: () => assert.fail("Disposed app cannot receive invalidation"),
  });
  const pending = session.submit({});
  session.destroy();
  finish({ status: "confirmed", item: { pipelineIds: ["S101"] } });
  await pending;
  assert.deepEqual(states, ["pending"]);
});
