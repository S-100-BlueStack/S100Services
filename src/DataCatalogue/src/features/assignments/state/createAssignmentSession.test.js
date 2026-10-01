import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentSession } from "./createAssignmentSession.js";
import { createPrototypeServices } from "../services/createPrototypeServices.js";
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function services() {
  const values = new Map();
  return createPrototypeServices({
    wait: async () => {},
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
}
test("Initial session has no automatically selected Feature", () => {
  const session = createAssignmentSession({ services: services() });
  assert.equal(session.snapshot().feature, null);
  assert.equal(session.snapshot().dirty, false);
});
test("Stale Feature and assignment responses cannot overwrite a newer selection", async () => {
  const oldFeature = deferred();
  const oldRecord = deferred();
  const service = services();
  const originalGet = service.features.get;
  const originalLoad = service.assignments.load;
  service.features.get = (id) => (id === "feature-1" ? oldFeature.promise : originalGet(id));
  service.assignments.load = (id) => (id === "feature-1" ? oldRecord.promise : originalLoad(id));
  const session = createAssignmentSession({ services: service });
  const old = session.select("feature-1");
  await session.select("feature-2");
  oldFeature.resolve(await originalGet("feature-1"));
  oldRecord.resolve(await originalLoad("feature-1"));
  assert.equal(await old, false);
  assert.equal(session.snapshot().feature.id, "feature-2");
});
test("A stale load failure cannot replace the current Feature with an error", async () => {
  const slow = deferred();
  const service = services();
  const originalGet = service.features.get;
  service.features.get = (id) => (id === "feature-1" ? slow.promise : originalGet(id));
  const session = createAssignmentSession({ services: service });
  const old = session.select("feature-1");
  await session.select("feature-2");
  slow.reject(new Error("Old failure"));
  await old;
  assert.equal(session.snapshot().feature.id, "feature-2");
  assert.equal(session.snapshot().error, "");
});
test("Dirty selection and clear require explicit resolution", async () => {
  const session = createAssignmentSession({ services: services() });
  await session.select("feature-1");
  session.setAssigned("DK1", true);
  assert.equal(await session.select("feature-2"), false);
  assert.equal(session.clear(), false);
  assert.equal(session.snapshot().feature.id, "feature-1");
  session.discard();
  assert.equal(session.snapshot().dirty, false);
  await session.select("feature-2");
  assert.equal(session.snapshot().feature.id, "feature-2");
});
test("Failed Save preserves assignments and editable draft comments for retry", async () => {
  const service = services();
  const session = createAssignmentSession({ services: service });
  await session.select("feature-1");
  session.setAssigned("DK1", true);
  session.addComment("DK1");
  const id = session.snapshot().draft.comments[0].id;
  session.editComment(id, "Keep on failure");
  service.testing.failNext("save");
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().dirty, true);
  assert.equal(session.snapshot().draft.comments[0].text, "Keep on failure");
  session.editComment(id, "Corrected draft");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().record.relations.DK1.comments[0].text, "Corrected draft");
});
test("Repeated Save shares one logical request and locks selection until it settles", async () => {
  const service = services();
  const session = createAssignmentSession({ services: service });
  await session.select("feature-1");
  session.setAssigned("DK1", true);
  const gate = deferred();
  let count = 0;
  const original = service.assignments.save;
  service.assignments.save = async (...args) => {
    count++;
    await gate.promise;
    return original(...args);
  };
  const first = session.save();
  const second = session.save();
  assert.equal(first, second);
  assert.equal(await session.select("feature-2"), false);
  session.setAssigned("DK2", true);
  session.discard();
  assert.deepEqual(session.snapshot().draft.activeIds, ["DK1"]);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(count, 1);
  assert.equal(session.snapshot().feature.id, "feature-1");
});
test("Destroyed session suppresses a late Save result and all notifications", async () => {
  const service = services();
  const session = createAssignmentSession({ services: service });
  await session.select("feature-1");
  session.setAssigned("DK1", true);
  const gate = deferred();
  service.assignments.save = () => gate.promise;
  const pending = session.save();
  let calls = 0;
  session.subscribe(() => calls++);
  session.destroy();
  const before = calls;
  gate.resolve({ featureId: "feature-1", relations: {} });
  assert.equal(await pending, false);
  assert.equal(calls, before);
});
test("Inactive Work streams cannot create comments and a draft assignment enables them before Save", async () => {
  const session = createAssignmentSession({ services: services() });
  await session.select("feature-1");
  assert.equal(session.addComment("DK2"), false);
  assert.equal(session.snapshot().draft.comments.length, 0);
  session.setAssigned("DK2", true);
  assert.equal(session.addComment("DK2"), true);
  assert.equal(session.snapshot().draft.comments.length, 1);
});
test("Unassigning preserves comment drafts and blocks Save until reassigned", async () => {
  const session = createAssignmentSession({ services: services() });
  await session.select("feature-1");
  session.setAssigned("DK2", true);
  session.addComment("DK2");
  const id = session.snapshot().draft.comments[0].id;
  session.editComment(id, "Keep this draft");
  session.setAssigned("DK2", false);
  assert.equal(session.snapshot().draft.comments[0].text, "Keep this draft");
  assert.match(session.snapshot().validationError, /Assign DK2 again/);
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().dirty, true);
  assert.equal(session.snapshot().record.relations.DK2, undefined);
  session.setAssigned("DK2", true);
  assert.equal(session.snapshot().validationError, "");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().record.relations.DK2.comments[0].text, "Keep this draft");
});
test("Removing orphaned comment drafts resolves validation without changing saved history", async () => {
  const session = createAssignmentSession({ services: services() });
  await session.select("feature-1");
  session.setAssigned("DK2", true);
  session.addComment("DK2");
  const id = session.snapshot().draft.comments[0].id;
  session.editComment(id, "Remove this draft");
  session.setAssigned("DK2", false);
  assert.notEqual(session.snapshot().validationError, "");
  session.removeComment(id);
  assert.equal(session.snapshot().validationError, "");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().record.relations.DK2, undefined);
});
