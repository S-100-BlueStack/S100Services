const TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function historyTimeLabel(occurredAtUtc) {
  return `${TIME.format(new Date(occurredAtUtc))} UTC`;
}

const LOCAL_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function localHistoryTimeLabel(timestamp) {
  if (typeof timestamp !== "string") return "Date unavailable";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  const parts = Object.fromEntries(
    LOCAL_TIME.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function historyActorLabel(actor) {
  return actor?.match(/^[^\\]+\\([^\\]+)$/)?.[1] ?? actor ?? "Actor not recorded";
}
