import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_RANGE_PRESETS,
  createDashboardRange,
  formatDashboardRangeDateTime,
  normalizeDashboardRangePreset,
} from "./dashboardRange.js";

describe("dashboardRange", () => {
  it("creates since yesterday from Danish midnight yesterday", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.sinceYesterday, {}, now);

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.sinceYesterday);
    assert.equal(range.fromIso, "2026-07-06T22:00:00.000Z");
    assert.equal(range.fromQueryValue, "2026-07-07");
    assert.equal(range.toQueryValue, null);
    assert.equal(range.toIso, "2026-07-08T10:30:00.000Z");
    assert.match(range.displayLabel, /^Since yesterday:/);
  });

  it("creates a last seven calendar days range from Danish midnight", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.last7Days, {}, now);

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.last7Days);
    assert.equal(range.fromIso, "2026-06-30T22:00:00.000Z");
    assert.equal(range.fromQueryValue, "2026-07-01");
    assert.equal(range.toQueryValue, null);
    assert.equal(range.toIso, "2026-07-08T10:30:00.000Z");
  });

  it("formats dashboard date/time values in Europe/Copenhagen", () => {
    const formatted = formatDashboardRangeDateTime("2026-07-06T22:00:00.000Z");

    assert.match(formatted, /07 Jul 2026/);
    assert.match(formatted, /00:00/);
    assert.doesNotMatch(formatted, /CET|CEST/);
  });

  it("falls back to the default preset for unknown values", () => {
    assert.equal(normalizeDashboardRangePreset("unknown"), DASHBOARD_RANGE_PRESETS.sinceYesterday);
  });
});
