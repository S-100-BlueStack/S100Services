const TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function historyTimeLabel(occurredAtUtc) {
  return `${TIME.format(new Date(occurredAtUtc))} UTC`;
}

export function historyActorLabel(actor) {
  return actor?.match(/^[^\\]+\\([^\\]+)$/)?.[1] ?? actor ?? "Actor not recorded";
}
