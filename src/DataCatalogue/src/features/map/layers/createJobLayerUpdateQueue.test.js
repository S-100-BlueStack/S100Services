import assert from "node:assert/strict";
import test from "node:test";
import { createJobLayerUpdateQueue } from "./createJobLayerUpdateQueue.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function settled() {
  return { ok: true, data: { pointCount: 1, polygonCount: 0 } };
}

test("overlapping snapshots are serialized and only the newest pending snapshot is written", async () => {
  const firstWrite = deferred();
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const queue = createJobLayerUpdateQueue({
    async writeSnapshot({ jobs, shouldApply }) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(jobs);
      if (jobs === "old") {
        await firstWrite.promise;
      }
      inFlight -= 1;
      return shouldApply() ? settled() : { ok: true, meta: { superseded: true } };
    },
  });

  const old = queue.request({ jobs: "old" });
  const skipped = queue.request({ jobs: "middle" });
  const latest = queue.request({ jobs: "latest" });
  firstWrite.resolve();

  assert.equal((await old).meta?.superseded, true);
  assert.equal((await skipped).meta?.superseded, true);
  assert.equal((await latest).ok, true);
  assert.deepEqual(calls, ["old", "latest"]);
  assert.equal(maxInFlight, 1);
});

test("an old query cannot publish edits after a newer snapshot arrives", async () => {
  const query = deferred();
  const edits = [];
  const queue = createJobLayerUpdateQueue({
    async writeSnapshot({ jobs, shouldApply }) {
      if (jobs === "old") {
        await query.promise;
      }
      if (shouldApply()) {
        edits.push(jobs);
      }
      return settled();
    },
  });

  const old = queue.request({ jobs: "old" });
  const latest = queue.request({ jobs: "latest" });
  query.resolve();

  await Promise.all([old, latest]);
  assert.deepEqual(edits, ["latest"]);
});

test("a started edit completes before the latest snapshot begins writing", async () => {
  const previousEdit = deferred();
  const submissions = [];
  const queue = createJobLayerUpdateQueue({
    async writeSnapshot({ jobs, shouldApply }) {
      if (!shouldApply()) {
        return settled();
      }
      submissions.push(`start:${jobs}`);
      if (jobs === "todo") {
        await previousEdit.promise;
      }
      submissions.push(`end:${jobs}`);
      return settled();
    },
  });

  const first = queue.request({ jobs: "todo" });
  const newest = queue.request({ jobs: "done" });
  assert.deepEqual(submissions, ["start:todo"]);
  previousEdit.resolve();
  await Promise.all([first, newest]);

  assert.deepEqual(submissions, ["start:todo", "end:todo", "start:done", "end:done"]);
});

test("dispose drops queued requests and prevents publication after teardown", async () => {
  const pendingWrite = deferred();
  const attempts = [];
  const queue = createJobLayerUpdateQueue({
    async writeSnapshot({ jobs, shouldApply }) {
      attempts.push(jobs);
      await pendingWrite.promise;
      return shouldApply() ? settled() : { ok: true, meta: { superseded: true } };
    },
  });

  const first = queue.request({ jobs: "old" });
  const queued = queue.request({ jobs: "new" });
  queue.dispose();
  pendingWrite.resolve();

  assert.equal((await first).meta?.superseded, true);
  assert.equal((await queued).meta?.superseded, true);
  assert.equal((await queue.request({ jobs: "late" })).meta?.superseded, true);
  assert.deepEqual(attempts, ["old"]);
});

test("failed current write reports error and a subsequent request may recover", async () => {
  const queue = createJobLayerUpdateQueue({
    async writeSnapshot({ jobs }) {
      if (jobs === "bad") {
        throw new Error("Edit failed");
      }
      return settled();
    },
  });

  const failed = await queue.request({ jobs: "bad" });
  const recovered = await queue.request({ jobs: "good" });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.message, "Edit failed");
  assert.equal(recovered.ok, true);
});
