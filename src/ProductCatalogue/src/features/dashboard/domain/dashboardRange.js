export const DASHBOARD_TIME_ZONE = "Europe/Copenhagen";

export const DASHBOARD_RANGE_PRESETS = {
  sinceYesterday: "since-yesterday",
  last7Days: "last-7-days",
  custom: "custom",
};

const RANGE_OPTIONS = [
  {
    value: DASHBOARD_RANGE_PRESETS.sinceYesterday,
    label: "Since yesterday",
    description: "Activity from yesterday at 00:00 Danish time until now.",
  },
  {
    value: DASHBOARD_RANGE_PRESETS.last7Days,
    label: "Last 7 days",
    description: "Activity from seven calendar days ago at 00:00 Danish time until now.",
  },
  {
    value: DASHBOARD_RANGE_PRESETS.custom,
    label: "Custom range",
    description: "Activity between selected Danish date/time values.",
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
    const nowParts = getTimeZoneDateParts(normalizedNow, DASHBOARD_TIME_ZONE);
    const rangeFromParts = addCalendarDays(nowParts, -7);
    const rangeFrom = createDateInTimeZone(
      { ...rangeFromParts, hour: 0, minute: 0, second: 0 },
      DASHBOARD_TIME_ZONE
    );

    return createRange({
      preset: DASHBOARD_RANGE_PRESETS.last7Days,
      label: "Last 7 days",
      from: rangeFrom,
      to: normalizedNow,
      // Date-only input keeps the range aligned to Danish calendar days.
      fromQueryValue: formatDateOnly(rangeFromParts),
      // Keep preset ranges open-ended so Refresh always asks the backend for "now".
      toQueryValue: null,
    });
  }

  if (normalizedPreset === DASHBOARD_RANGE_PRESETS.custom) {
    const customFrom = parseDashboardRangeInput(from, {
      dateOnlyDefaultTime: { hour: 0, minute: 0, second: 0 },
    });
    const customTo = parseDashboardRangeInput(to, {
      dateOnlyDefaultTime: { hour: 23, minute: 59, second: 0 },
    });

    if (customFrom && (!customTo || customFrom <= customTo)) {
      return createRange({
        preset: DASHBOARD_RANGE_PRESETS.custom,
        label: "Selected range",
        from: customFrom,
        // An empty To keeps the range open-ended so Refresh always includes the latest backend data.
        to: customTo ?? normalizedNow,
        // The backend interprets offset-free datetime values as Europe/Copenhagen.
        fromQueryValue: formatDashboardQueryDateTime(customFrom),
        toQueryValue: customTo ? formatDashboardQueryDateTime(customTo) : null,
      });
    }
  }

  const nowParts = getTimeZoneDateParts(normalizedNow, DASHBOARD_TIME_ZONE);
  const yesterdayParts = addCalendarDays(nowParts, -1);
  const yesterdayStart = createDateInTimeZone(
    { ...yesterdayParts, hour: 0, minute: 0, second: 0 },
    DASHBOARD_TIME_ZONE
  );

  return createRange({
    preset: DASHBOARD_RANGE_PRESETS.sinceYesterday,
    label: "Since yesterday",
    from: yesterdayStart,
    to: normalizedNow,
    // Date-only input is intentional: the backend interprets it as Danish midnight.
    fromQueryValue: formatDateOnly(yesterdayParts),
    toQueryValue: null,
  });
}

export function normalizeDashboardRangePreset(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();
  const values = Object.values(DASHBOARD_RANGE_PRESETS);

  return values.includes(normalizedValue) ? normalizedValue : getDefaultDashboardRangePreset();
}

export function formatDashboardRangeDateTime(value, { timeZone = DASHBOARD_TIME_ZONE } = {}) {
  const date = normalizeDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDashboardDateTimeInputValue(value, { timeZone = DASHBOARD_TIME_ZONE } = {}) {
  const date = normalizeDate(value);

  if (!date) {
    return "";
  }

  const parts = getTimeZoneDateParts(date, timeZone);
  return `${formatDateOnly(parts)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function createDashboardRangeDisplayLabel({
  label,
  fromIso,
  toIso,
  timeZone = DASHBOARD_TIME_ZONE,
}) {
  const fromText = formatDashboardRangeDateTime(fromIso, { timeZone });
  const toText = formatDashboardRangeDateTime(toIso, { timeZone });
  const zoneSuffix = timeZone ? ` (${timeZone})` : "";

  return `${label}: ${fromText} - ${toText}${zoneSuffix}`;
}

function createRange({ preset, label, from, to, fromQueryValue, toQueryValue }) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  return {
    preset,
    label,
    from,
    to,
    fromIso,
    toIso,
    fromQueryValue: fromQueryValue === undefined ? fromIso : fromQueryValue,
    toQueryValue: toQueryValue === undefined ? toIso : toQueryValue,
    timeZone: DASHBOARD_TIME_ZONE,
    displayLabel: createDashboardRangeDisplayLabel({
      label,
      fromIso,
      toIso,
      timeZone: DASHBOARD_TIME_ZONE,
    }),
  };
}

function parseDashboardRangeInput(value, { dateOnlyDefaultTime = null } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmedValue = value.trim();
  const localParts = parseOffsetFreeDanishDateTime(trimmedValue, {
    dateOnlyDefaultTime,
  });

  if (localParts) {
    return createDateInTimeZone(localParts, DASHBOARD_TIME_ZONE);
  }

  return normalizeDate(trimmedValue);
}

function parseOffsetFreeDanishDateTime(value, { dateOnlyDefaultTime = null } = {}) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);

  if (!match) {
    return null;
  }

  const defaultTime = dateOnlyDefaultTime ?? { hour: 0, minute: 0, second: 0 };
  const hasExplicitTime = match[4] !== undefined;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(hasExplicitTime ? match[4] : defaultTime.hour),
    minute: Number(hasExplicitTime ? (match[5] ?? 0) : defaultTime.minute),
    second: Number(hasExplicitTime ? (match[6] ?? 0) : defaultTime.second),
  };

  return areValidDateTimeParts(parts) ? parts : null;
}

function areValidDateTimeParts(parts) {
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return false;
  }

  const check = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );

  return (
    check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() + 1 === parts.month &&
    check.getUTCDate() === parts.day &&
    check.getUTCHours() === parts.hour &&
    check.getUTCMinutes() === parts.minute &&
    check.getUTCSeconds() === parts.second
  );
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

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function createDateInTimeZone(parts, timeZone) {
  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );

  // Intl can tell us how a UTC instant renders in Copenhagen. Iterating the
  // difference gives the UTC instant that represents the requested wall time,
  // including DST transitions, without adding a date library.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const renderedParts = getTimeZoneDateParts(new Date(utcMs), timeZone);
    const renderedMs = Date.UTC(
      renderedParts.year,
      renderedParts.month - 1,
      renderedParts.day,
      renderedParts.hour,
      renderedParts.minute,
      renderedParts.second
    );
    const targetMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0
    );

    utcMs -= renderedMs - targetMs;
  }

  return new Date(utcMs);
}

function formatDashboardQueryDateTime(value) {
  const parts = getTimeZoneDateParts(value, DASHBOARD_TIME_ZONE);

  return `${formatDateOnly(parts)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

function formatDateOnly(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function getTimeZoneDateParts(value, timeZone) {
  const date = normalizeDate(value) ?? new Date();
  const formattedParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const partMap = Object.fromEntries(
    formattedParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    hour: partMap.hour,
    minute: partMap.minute,
    second: partMap.second,
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
