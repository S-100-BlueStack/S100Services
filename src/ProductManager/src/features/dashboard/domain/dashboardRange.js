export const DASHBOARD_RANGE_PRESETS = {
  sinceYesterday: "since-yesterday",
  last7Days: "last-7-days",
  custom: "custom",
};

const RANGE_OPTIONS = [
  {
    value: DASHBOARD_RANGE_PRESETS.sinceYesterday,
    label: "Since yesterday",
    description: "Activity from yesterday at 00:00 until now.",
  },
  {
    value: DASHBOARD_RANGE_PRESETS.last7Days,
    label: "Last 7 days",
    description: "Rolling activity for the last seven days.",
  },
  {
    value: DASHBOARD_RANGE_PRESETS.custom,
    label: "Custom range",
    description: "Requires backend support for arbitrary ranges.",
    disabled: true,
  },
];

export function getDashboardRangeOptions() {
  return RANGE_OPTIONS.map((option) => ({ ...option }));
}

export function getDefaultDashboardRangePreset() {
  return DASHBOARD_RANGE_PRESETS.sinceYesterday;
}

export function createDashboardRange(
  preset = getDefaultDashboardRangePreset(),
  { from = null, to = null } = {},
  now = new Date()
) {
  const normalizedPreset = normalizeDashboardRangePreset(preset);
  const normalizedNow = normalizeDate(now) ?? new Date();

  if (normalizedPreset === DASHBOARD_RANGE_PRESETS.last7Days) {
    return createRange({
      preset: DASHBOARD_RANGE_PRESETS.last7Days,
      label: "Last 7 days",
      from: addDays(normalizedNow, -7),
      to: normalizedNow,
    });
  }

  if (normalizedPreset === DASHBOARD_RANGE_PRESETS.custom) {
    const customFrom = normalizeDate(from);
    const customTo = normalizeDate(to);

    if (customFrom && customTo && customFrom <= customTo) {
      return createRange({
        preset: DASHBOARD_RANGE_PRESETS.custom,
        label: "Custom range",
        from: customFrom,
        to: customTo,
      });
    }
  }

  return createRange({
    preset: DASHBOARD_RANGE_PRESETS.sinceYesterday,
    label: "Since yesterday",
    from: startOfLocalDay(addDays(normalizedNow, -1)),
    to: normalizedNow,
  });
}

export function normalizeDashboardRangePreset(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();
  const values = Object.values(DASHBOARD_RANGE_PRESETS);

  return values.includes(normalizedValue) ? normalizedValue : getDefaultDashboardRangePreset();
}

export function formatDashboardRangeDateTime(value) {
  const date = normalizeDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createRange({ preset, label, from, to }) {
  return {
    preset,
    label,
    from,
    to,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    displayLabel: `${label}: ${formatDashboardRangeDateTime(from)} - ${formatDashboardRangeDateTime(to)}`,
  };
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);

  return date;
}
