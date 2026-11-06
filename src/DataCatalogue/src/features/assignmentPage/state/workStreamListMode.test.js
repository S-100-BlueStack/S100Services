import test from "node:test";
import assert from "node:assert/strict";
import {
  WORK_STREAM_LIST_MODE,
  normalizeWorkStreamListMode,
  toggleWorkStreamListMode,
  workStreamIdsForMode,
  workStreamModeButtonLabel,
} from "./workStreamListMode.js";

test("A Not assigned Feature cannot remain in active-only Work stream mode", () => {
  assert.equal(
    normalizeWorkStreamListMode(WORK_STREAM_LIST_MODE.ACTIVE, 0),
    WORK_STREAM_LIST_MODE.ALL
  );
});

test("An assigned Feature preserves an explicit Show all preference", () => {
  assert.equal(
    normalizeWorkStreamListMode(WORK_STREAM_LIST_MODE.ALL, 2),
    WORK_STREAM_LIST_MODE.ALL
  );
});

test("Show active and Show all are the only Work stream list modes", () => {
  assert.equal(toggleWorkStreamListMode(WORK_STREAM_LIST_MODE.ALL), WORK_STREAM_LIST_MODE.ACTIVE);
  assert.equal(toggleWorkStreamListMode(WORK_STREAM_LIST_MODE.ACTIVE), WORK_STREAM_LIST_MODE.ALL);
  assert.equal(workStreamModeButtonLabel(WORK_STREAM_LIST_MODE.ALL), "Show active");
  assert.equal(workStreamModeButtonLabel(WORK_STREAM_LIST_MODE.ACTIVE), "Show all");
  assert.deepEqual(
    workStreamIdsForMode({ activeIds: ["DK1", "DK3"] }, WORK_STREAM_LIST_MODE.ACTIVE),
    ["DK1", "DK3"]
  );
  assert.equal(workStreamIdsForMode({ activeIds: ["DK1"] }, WORK_STREAM_LIST_MODE.ALL), null);
});
