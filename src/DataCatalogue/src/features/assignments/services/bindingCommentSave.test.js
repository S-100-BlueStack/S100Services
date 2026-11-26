import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createLiveAssignmentServices } from "./liveAssignmentServices.js";
import { createAssignmentSession } from "../state/createAssignmentSession.js";

const utc = "2026-11-25T13:00:00Z";

function fixture() {
  const active = new Set(["enc"]);
  const saved = [];
  const writes = [];
  const catalogue = {
    package: async (id) => ({ id }),
    bindings: async (id) =>
      [...active].map((pipelineId) => ({
        id: `${id}::${pipelineId}`,
        pipelineId,
        workspaces: [],
      })),
    async bind(_id, pipelineId) {
      writes.push(["bind", pipelineId]);
      if (pipelineId === "blocked") throw Object.assign(new Error("Denied"), { status: 403 });
      active.add(pipelineId);
    },
    async unbind(id) {
      const pipelineId = id.split("::")[1];
      writes.push(["unbind", pipelineId]);
      active.delete(pipelineId);
    },
    async bindingComments(packageId) {
      return { items: saved.filter((item) => item.packageId === packageId), nextBefore: null };
    },
    async addBindingComment(packageId, { id, workStreamId, text }) {
      writes.push(["comment", workStreamId, id]);
      if (!active.has(workStreamId)) throw Object.assign(new Error("Inactive"), { status: 409 });
      if (!saved.some((item) => item.id === id)) {
        saved.unshift({
          id,
          packageId,
          pipelineId: workStreamId,
          text: text.trim(),
          actor: "PROD\\B123456",
          occurredAtUtc: utc,
        });
      }
    },
  };
  const services = createLiveAssignmentServices(catalogue, { bindingRequestTimeoutMs: 40 });
  const session = createAssignmentSession({ services });
  return { active, saved, writes, catalogue, session };
}

function addDraft(session, workStreamId, text) {
  assert.equal(session.addComment(workStreamId), true);
  const { id } = session.snapshot().draft.comments.at(-1);
  session.editComment(id, text);
  return id;
}

test("Save binds first and reads back independent Workstream comments", async () => {
  const { session, writes } = fixture();
  await session.select("package");
  session.setAssigned("paper", true);
  const enc = addDraft(session, "enc", "First\nline");
  const paper = addDraft(session, "paper", "Chart review");
  assert.deepEqual(writes, []);
  const save = session.save();
  assert.equal(save, session.save());
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(await save, true);
  assert.deepEqual(writes, [
    ["bind", "paper"],
    ["comment", "enc", enc],
    ["comment", "paper", paper],
  ]);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().saveConfirmed, true);
  assert.equal(session.snapshot().commentHistory.byPipeline.enc[0].text, "First\nline");
  assert.equal(session.snapshot().commentHistory.byPipeline.paper[0].actor, "PROD\\B123456");

  session.setAssigned("enc", false);
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().record.relations.enc, undefined);
  assert.equal(session.snapshot().commentHistory.byPipeline.enc[0].id, enc);
  session.setAssigned("enc", true);
  assert.equal(await session.save(), true);
  const second = addDraft(session, "enc", "Second");
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  assert.deepEqual(
    session.snapshot().commentHistory.byPipeline.enc.map((item) => item.id),
    [second, enc]
  );
  await session.select("other");
  await nextTurn();
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.deepEqual(session.snapshot().commentHistory.byPipeline, {});
});

test("partial Save removes confirmed drafts and keeps rejected bindings and comments", async () => {
  const { session, writes } = fixture();
  await session.select("package");
  session.setAssigned("blocked", true);
  const blocked = addDraft(session, "blocked", "Keep this draft");
  const enc = addDraft(session, "enc", "Saved");
  assert.equal(await session.save(), false);
  assert.deepEqual(writes, [
    ["bind", "blocked"],
    ["comment", "enc", enc],
  ]);
  assert.equal(session.snapshot().commentHistory.byPipeline.enc[0].id, enc);
  assert.deepEqual(
    session.snapshot().draft.comments.map((item) => item.id),
    [blocked]
  );
  assert.match(session.snapshot().error, /binding is not confirmed active/);
  assert.equal(session.snapshot().saveConfirmed, false);
  session.setAssigned("blocked", false);
  assert.match(session.snapshot().validationError, /Assign blocked again/);
  session.discard();
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(writes.length, 2);
});

test("comment Save cannot recreate a remotely removed binding", async () => {
  const { active, session, writes } = fixture();
  await session.select("package");
  addDraft(session, "enc", "Waiting for review");
  active.delete("enc");
  active.add("other");
  assert.equal(await session.save(), false);
  assert.deepEqual(writes, []);
  assert.deepEqual(session.snapshot().draft.activeIds, ["other"]);
  assert.match(session.snapshot().validationError, /Assign enc again/);
  assert.equal(await session.save(), false);
  assert.deepEqual(writes, []);
  assert.equal(session.snapshot().saveConfirmed, false);
});

test("a lost append response is reconciled read-only and removes the confirmed draft", async () => {
  const { catalogue, session, writes } = fixture();
  const append = catalogue.addBindingComment;
  catalogue.addBindingComment = async (...args) => {
    await append(...args);
    throw Object.assign(new Error("Connection lost"), { kind: "network" });
  };
  await session.select("package");
  const id = addDraft(session, "enc", "Saved before disconnect");
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(session.snapshot().draft.comments[0].awaitingConfirmation, true);
  assert.equal(await session.save(), false);
  assert.equal(await session.reconcile(), true);
  assert.deepEqual(writes, [["comment", "enc", id]]);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(session.snapshot().commentHistory.byPipeline.enc[0].id, id);
});

test("an unresolved append retries with its original UUID and text", async () => {
  const { catalogue, session, writes } = fixture();
  const append = catalogue.addBindingComment;
  let attempts = 0;
  catalogue.addBindingComment = (packageId, comment, options) => {
    if (++attempts === 1) return new Promise(() => {});
    return append(packageId, comment, options);
  };
  await session.select("package");
  const id = addDraft(session, "enc", "Keep original");
  assert.equal(await session.save(), false);
  assert.equal(await session.reconcile(), true);
  assert.equal(session.snapshot().saveConfirmed, false);
  session.editComment(id, "Changed text");
  assert.equal(session.snapshot().draft.comments[0].text, "Keep original");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  assert.deepEqual(writes, [["comment", "enc", id]]);
  assert.equal(session.snapshot().commentHistory.byPipeline.enc[0].id, id);
});

test("confirmation persists through reads and resets after a draft edit or clear", async () => {
  const { catalogue, session, writes } = fixture();
  assert.equal(session.snapshot().saveConfirmed, false);
  await session.select("package");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.deepEqual(writes, []);

  addDraft(session, "enc", "Comment only");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  session.setAssigned("enc", true);
  assert.equal(session.snapshot().saveConfirmed, true);

  const read = catalogue.bindingComments;
  catalogue.bindingComments = async () => {
    throw new Error("History unavailable");
  };
  await session.refreshComments();
  assert.equal(session.snapshot().commentHistory.error, "History unavailable");
  assert.equal(session.snapshot().saveConfirmed, true);
  catalogue.bindingComments = read;
  await session.refreshComments();
  assert.equal(session.snapshot().saveConfirmed, true);
  await session.select("package");
  assert.equal(session.snapshot().saveConfirmed, true);

  const draftId = addDraft(session, "enc", "Discard this comment");
  assert.equal(session.snapshot().saveConfirmed, false);
  session.removeComment(draftId);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().saveConfirmed, false);
  session.addComment("enc");
  assert.match(session.snapshot().validationError, /Enter a comment/);
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().saveConfirmed, false);
  session.discard();

  addDraft(session, "enc", "Save before clearing");
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  assert.equal(session.clear(), true);
  assert.equal(session.snapshot().saveConfirmed, false);
});

test("late live Save confirmation cannot publish after the session is disposed", async () => {
  const { catalogue, session } = fixture();
  const append = catalogue.addBindingComment;
  const { promise, resolve } = Promise.withResolvers();
  catalogue.addBindingComment = async (...args) => {
    await promise;
    return append(...args);
  };
  await session.select("first");
  addDraft(session, "enc", "Late confirmation");
  const save = session.save();
  assert.equal(await session.select("second"), false);
  await nextTurn();
  assert.equal(session.snapshot().saving, true);
  assert.equal(session.snapshot().saveConfirmed, false);

  const published = [];
  session.subscribe(({ saveConfirmed }) => published.push(saveConfirmed));
  session.destroy();
  resolve();
  assert.equal(await save, false);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.deepEqual(published, [false]);
});

test("a failed readback requires another read and does not lose the draft", async () => {
  const { catalogue, session, writes } = fixture();
  const read = catalogue.bindingComments;
  let failed = false;
  catalogue.bindingComments = (...args) => {
    if (failed) throw new Error("Comment history unavailable");
    return read(...args);
  };
  const append = catalogue.addBindingComment;
  catalogue.addBindingComment = async (...args) => {
    await append(...args);
    failed = true;
  };
  await session.select("package");
  const id = addDraft(session, "enc", "Readback is required");
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.equal(session.snapshot().draft.comments[0].id, id);
  assert.equal(await session.reconcile(), false);
  assert.match(session.snapshot().error, /Comment history unavailable/);
  failed = false;
  assert.equal(await session.reconcile(), true);
  assert.equal(session.snapshot().dirty, false);
  assert.deepEqual(writes, [["comment", "enc", id]]);
});

test("comment reads are single-flight and scoped to the active selection", async () => {
  const { catalogue, session } = fixture();
  const pending = new Map();
  catalogue.bindingComments = (id, options) =>
    new Promise((resolve) => pending.set(id, { resolve, signal: options.signal }));
  const seen = [];
  session.subscribe((snapshot) => seen.push(snapshot));
  await session.select("first");
  await session.refreshComments();
  assert.equal(pending.size, 1);
  await session.select("second");
  assert.equal(pending.get("first").signal.aborted, true);
  pending.get("first").resolve({ items: [{ id: "old", pipelineId: "enc" }], nextBefore: null });
  await nextTurn();
  assert.equal(session.snapshot().feature.id, "second");
  assert.equal(session.snapshot().commentHistory.loading, true);
  session.destroy();
  assert.equal(pending.get("second").signal.aborted, true);
  const count = seen.length;
  pending.get("second").resolve({ items: [], nextBefore: null });
  await nextTurn();
  assert.equal(seen.length, count);
});

test("assignment history distinguishes paged success from a failed read", async () => {
  const { catalogue, session } = fixture();
  const calls = [];
  let fail = true;
  catalogue.bindingComments = async (id, { before }) => {
    calls.push([id, before]);
    if (fail) throw new Error("Page unavailable");
    return before
      ? { items: [{ id: "older", pipelineId: "enc" }], nextBefore: null }
      : { items: [{ id: "newer", pipelineId: "enc" }], nextBefore: "newer" };
  };
  await session.select("package");
  await nextTurn();
  assert.equal(session.snapshot().commentHistory.error, "Page unavailable");
  assert.equal(session.snapshot().commentHistory.byPipeline, undefined);
  fail = false;
  await session.refreshComments();
  assert.deepEqual(calls, [
    ["package", null],
    ["package", null],
    ["package", "newer"],
  ]);
  assert.deepEqual(
    session.snapshot().commentHistory.byPipeline.enc.map((item) => item.id),
    ["newer", "older"]
  );
});
