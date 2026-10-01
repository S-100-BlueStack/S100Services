import test from "node:test";
import assert from "node:assert/strict";
import { createMapRetryHandler } from "./createAssignmentPage.js";

test("Retry map action invokes one logical retry per activation", () => {
  let retryCount = 0;
  const retry = createMapRetryHandler(() => {
    retryCount += 1;
  });

  retry();
  assert.equal(retryCount, 1);

  retry();
  assert.equal(retryCount, 2);
});
