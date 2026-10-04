const EMPTY_REFRESH_HELP = "No successful data refresh yet.";

export function createLastUpdatedPresentation(date = new Date()) {
  const timestamp = normalizeDate(date);
  const text = formatCompactTime(timestamp);
  const helpText = `Last successful data refresh: ${timestamp.toLocaleString()}`;

  return { text, title: helpText, ariaLabel: helpText };
}

export function createRefreshingPresentation() {
  const helpText =
    "Refreshing Product data. The last successful refresh time will be retained if this refresh fails.";

  return { text: "Refreshing...", title: helpText, ariaLabel: helpText };
}

export function createEmptyLastUpdatedPresentation() {
  return { text: "-", title: EMPTY_REFRESH_HELP, ariaLabel: EMPTY_REFRESH_HELP };
}

export function readLastUpdatedPresentation(element) {
  if (!element) {
    return createEmptyLastUpdatedPresentation();
  }

  return {
    text: element.textContent ?? "",
    title: element.getAttribute("title") ?? "",
    ariaLabel: element.getAttribute("aria-label") ?? "",
  };
}

export function applyLastUpdatedPresentation(element, presentation) {
  if (!element || !presentation) return;

  element.textContent = presentation.text;
  setOptionalAttribute(element, "title", presentation.title);
  setOptionalAttribute(element, "aria-label", presentation.ariaLabel);
}

function formatCompactTime(date) {
  const parts = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value.padStart(2, "0") ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value.padStart(2, "0") ?? "00";

  return `${hour}:${minute}`;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("A valid refresh timestamp is required.");
  }
  return date;
}

function setOptionalAttribute(element, name, value) {
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}
