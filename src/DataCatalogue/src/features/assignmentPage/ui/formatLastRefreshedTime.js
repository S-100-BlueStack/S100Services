// Use the browser's local time but keep a consistent 24-hour HH:MM display.
const REFRESH_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatLastRefreshedTime(date) {
  return REFRESH_TIME_FORMATTER.format(date);
}
