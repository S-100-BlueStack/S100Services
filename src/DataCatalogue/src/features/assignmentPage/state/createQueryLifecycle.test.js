import test from "node:test";
import assert from "node:assert/strict";
import { createQueryLifecycle } from "./createQueryLifecycle.js";
test("Superseded Work stream searches cannot publish either success or failure", async () => {
  const owner = createQueryLifecycle();
  let finish;
  let result = "";
  const old = owner.begin();
  const response = new Promise((resolve) => {
    finish = resolve;
  }).then(() => {
    if (old()) result = "old Work stream results";
  });
  const latest = owner.begin();
  if (latest()) result = "new Work stream results";
  finish();
  await response;
  assert.equal(result, "new Work stream results");
  assert.equal(old(), false);
});
test("Filter changes invalidate pending responses before the debounce begins its request", () => {
  const owner = createQueryLifecycle();
  const pending = owner.begin();
  owner.invalidate();
  assert.equal(pending(), false);
  const next = owner.begin();
  assert.equal(next(), true);
  owner.destroy();
  assert.equal(next(), false);
  assert.equal(owner.begin()(), false);
});
