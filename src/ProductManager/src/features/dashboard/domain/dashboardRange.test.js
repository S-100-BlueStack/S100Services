import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_RANGE_PRESETS,
  createDashboardRange,
  normalizeDashboardRangePreset,
} from "./dashboardRange.js";

describe("dashboardRange", () => {
  it("creates since yesterday from local midnight yesterday", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.sinceYesterday, {}, now);

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.sinceYesterday);
    assert.equal(range.toIso, "2026-07-08T10:30:00.000Z");
    assert.match(range.displayLabel, /^Since yesterday:/);
  });

  it("creates a rolling last seven days range", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.last7Days, {}, now);

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.last7Days);
    assert.equal(range.fromIso, "2026-07-01T10:30:00.000Z");
    assert.equal(range.toIso, "2026-07-08T10:30:00.000Z");
  });

  it("falls back to the default preset for unknown values", () => {
    assert.equal(normalizeDashboardRangePreset("unknown"), DASHBOARD_RANGE_PRESETS.sinceYesterday);
  });
});
