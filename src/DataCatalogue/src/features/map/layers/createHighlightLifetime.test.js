import assert from "node:assert/strict";
import test from "node:test";
import { createHighlightLifetime } from "./createHighlightLifetime.js";

function createHandle() {
  let removed = 0;
  return {
    remove() {
      removed += 1;
    },
    get removeCount() {
      return removed;
    },
  };
}

test("clear invalidates pending selection even when no highlight exists yet", () => {
  const lifetime = createHighlightLifetime();
  const oldToken = lifetime.begin();

  lifetime.clear();

  assert.equal(lifetime.isCurrent(oldToken), false);
  const lateHandle = createHandle();
  assert.equal(lifetime.install(oldToken, lateHandle), false);
  assert.equal(lateHandle.removeCount, 1);
});

test("new selection removes the previous highlight and rejects stale handles", () => {
  const lifetime = createHighlightLifetime();
  const first = lifetime.begin();
  const firstHandle = createHandle();
  assert.equal(lifetime.install(first, firstHandle), true);

  const second = lifetime.begin();
  const secondHandle = createHandle();
  assert.equal(firstHandle.removeCount, 1);
  assert.equal(lifetime.isCurrent(first), false);
  assert.equal(lifetime.install(second, secondHandle), true);

  lifetime.clear();
  assert.equal(secondHandle.removeCount, 1);
});

test("destroy invalidates pending selections and prevents new highlight operations", () => {
  const lifetime = createHighlightLifetime();
  const token = lifetime.begin();

  lifetime.destroy();

  assert.equal(lifetime.isCurrent(token), false);
  assert.equal(lifetime.begin(), null);
  assert.equal(lifetime.install(token, createHandle()), false);
});
