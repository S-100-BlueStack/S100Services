import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_RANGE_PRESETS,
  createDashboardRange,
  formatDashboardDateTimeInputValue,
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

  it("creates a custom range from Danish local datetime inputs", () => {
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.custom, {
      from: "2026-07-01T08:15",
      to: "2026-07-07T16:45",
    });

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.custom);
    assert.equal(range.fromIso, "2026-07-01T06:15:00.000Z");
    assert.equal(range.toIso, "2026-07-07T14:45:00.000Z");
    assert.equal(range.fromQueryValue, "2026-07-01T08:15:00");
    assert.equal(range.toQueryValue, "2026-07-07T16:45:00");
    assert.match(range.displayLabel, /^Selected range:/);
  });

  it("creates an open-ended custom range when To is empty", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(
      DASHBOARD_RANGE_PRESETS.custom,
      {
        from: "2026-07-01T08:15",
        to: "",
      },
      now
    );

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.custom);
    assert.equal(range.fromIso, "2026-07-01T06:15:00.000Z");
    assert.equal(range.toIso, "2026-07-08T10:30:00.000Z");
    assert.equal(range.fromQueryValue, "2026-07-01T08:15:00");
    assert.equal(range.toQueryValue, null);
  });

  it("uses start and end of day defaults for custom date-only inputs", () => {
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.custom, {
      from: "2026-07-01",
      to: "2026-07-07",
    });

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.custom);
    assert.equal(range.fromIso, "2026-06-30T22:00:00.000Z");
    assert.equal(range.toIso, "2026-07-07T21:59:00.000Z");
    assert.equal(range.fromQueryValue, "2026-07-01T00:00:00");
    assert.equal(range.toQueryValue, "2026-07-07T23:59:00");
  });

  it("keeps custom range parsing stable during Danish winter time", () => {
    const range = createDashboardRange(DASHBOARD_RANGE_PRESETS.custom, {
      from: "2026-01-02T08:00",
      to: "2026-01-02T09:30",
    });

    assert.equal(range.fromIso, "2026-01-02T07:00:00.000Z");
    assert.equal(range.toIso, "2026-01-02T08:30:00.000Z");
  });

  it("falls back to since yesterday when custom range is invalid", () => {
    const now = new Date("2026-07-08T10:30:00.000Z");
    const range = createDashboardRange(
      DASHBOARD_RANGE_PRESETS.custom,
      {
        from: "2026-07-08T10:00",
        to: "2026-07-08T09:00",
      },
      now
    );

    assert.equal(range.preset, DASHBOARD_RANGE_PRESETS.sinceYesterday);
    assert.equal(range.fromQueryValue, "2026-07-07");
  });

  it("formats dashboard date/time values in Europe/Copenhagen", () => {
    const formatted = formatDashboardRangeDateTime("2026-07-06T22:00:00.000Z");

    assert.match(formatted, /07 Jul 2026/);
    assert.match(formatted, /00:00/);
    assert.doesNotMatch(formatted, /CET|CEST/);
  });

  it("formats date/time input values in Europe/Copenhagen", () => {
    assert.equal(formatDashboardDateTimeInputValue("2026-07-01T06:15:00.000Z"), "2026-07-01T08:15");
  });

  it("falls back to the default preset for unknown values", () => {
    assert.equal(normalizeDashboardRangePreset("unknown"), DASHBOARD_RANGE_PRESETS.sinceYesterday);
  });
});
