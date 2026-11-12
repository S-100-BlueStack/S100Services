import assert from "node:assert/strict";
import test from "node:test";
import { formatLastRefreshedTime } from "./formatLastRefreshedTime.js";

test("Package assignment refresh shows only local 24-hour HH:MM", () => {
  assert.equal(formatLastRefreshedTime(new Date(2026, 10, 12, 9, 5)), "09:05");
  assert.equal(formatLastRefreshedTime(new Date(2026, 10, 12, 23, 7)), "23:07");
  assert.match(formatLastRefreshedTime(new Date()), /^([01][0-9]|2[0-3]):[0-5][0-9]$/);
});
