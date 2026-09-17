export function createDashboardLoadPresentation(value) {
  const timestamp = normalizeTimestamp(value);
  const text = formatCompactLocalTime(timestamp);
  const context = timestamp.toLocaleString();
  const helpText = `Last successful dashboard load: ${context}`;

  return {
    text,
    title: helpText,
    ariaLabel: helpText,
  };
}

function formatCompactLocalTime(timestamp) {
  const parts = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const hour = parts.find((part) => part.type === "hour")?.value.padStart(2, "0") ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value.padStart(2, "0") ?? "00";

  return `${hour}:${minute}`;
}

function normalizeTimestamp(value) {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("A valid Dashboard load timestamp is required.");
  }

  return timestamp;
}
