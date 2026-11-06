import assert from "node:assert/strict";
import test from "node:test";
import {
  BindingRequestTimeoutError,
  withBindingRequestDeadline,
} from "./withBindingRequestDeadline.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("deadline stops waiting even if the underlying request ignores AbortSignal", async () => {
  const request = deferred();
  let signal;
  await assert.rejects(
    withBindingRequestDeadline(
      ({ signal: received }) => {
        signal = received;
        return request.promise;
      },
      { stage: "Binding write", timeoutMs: 10 }
    ),
    (error) => error instanceof BindingRequestTimeoutError && error.stage === "Binding write"
  );
  assert.equal(signal.aborted, true);
  request.resolve({ saved: true });
  await Promise.resolve();
});

test("deadline covers response consumption as part of the request promise", async () => {
  const pendingBody = deferred();
  await assert.rejects(
    withBindingRequestDeadline(() => pendingBody.promise, {
      stage: "Binding response body",
      timeoutMs: 10,
    }),
    /timed out/
  );
  pendingBody.resolve("late response");
});

test("deadline forwards a successful result and an ordinary API error", async () => {
  const value = await withBindingRequestDeadline(
    async ({ signal }) => {
      assert.equal(signal.aborted, false);
      return { saved: true };
    },
    { stage: "Read", timeoutMs: 100 }
  );
  assert.deepEqual(value, { saved: true });
  const error = new Error("Denied");
  await assert.rejects(
    withBindingRequestDeadline(() => Promise.reject(error), { stage: "Read", timeoutMs: 100 }),
    (received) => received === error
  );
});
