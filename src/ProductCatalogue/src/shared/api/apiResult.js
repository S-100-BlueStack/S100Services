const MESSAGE_KEYS = [
  "errorMessage",
  "ErrorMessage",
  "message",
  "Message",
  "error",
  "Error",
  "detail",
  "Detail",
];

const TITLE_KEYS = ["title", "Title"];
const ERRORS_KEYS = ["errors", "Errors"];
const MAX_MESSAGE_LENGTH = 700;

export function getApiResultMessage(result, { maxLength = MAX_MESSAGE_LENGTH } = {}) {
  if (!result) {
    return null;
  }

  const directMessage = getFirstStringValue(result, MESSAGE_KEYS);

  if (directMessage) {
    return truncateMessage(directMessage, maxLength);
  }

  if (typeof result.data === "string" && result.data.trim()) {
    const parsedData = tryParseJson(result.data);

    if (parsedData && typeof parsedData === "object") {
      return truncateMessage(getObjectMessage(parsedData), maxLength);
    }

    return truncateMessage(result.data.trim(), maxLength);
  }

  if (result.data && typeof result.data === "object") {
    return truncateMessage(getObjectMessage(result.data), maxLength);
  }

  if (typeof result.statusText === "string" && result.statusText.trim()) {
    return truncateMessage(result.statusText.trim(), maxLength);
  }

  return null;
}

export function getApiFailureTitle(result, fallbackTitle = "Request failed") {
  if (result?.networkError) {
    return "Network error";
  }

  if (result?.status) {
    return `${fallbackTitle} (${result.status})`;
  }

  return fallbackTitle;
}

export function getErrorMessage(error, fallbackMessage = "Unknown error.") {
  if (error instanceof Error && error.message.trim()) {
    return truncateMessage(error.message.trim(), MAX_MESSAGE_LENGTH);
  }

  if (typeof error === "string" && error.trim()) {
    return truncateMessage(error.trim(), MAX_MESSAGE_LENGTH);
  }

  return fallbackMessage;
}

export function getApiResultErrorMessage(result, defaultMessage = "Request failed") {
  if (result?.networkError) {
    return result.errorMessage ?? defaultMessage;
  }

  const detail = getApiResultMessage(result);

  if (detail) {
    return `${defaultMessage}: ${detail}`;
  }

  if (result?.status) {
    return `${defaultMessage}: (${result.status}) ${result.statusText ?? "Request failed"}`;
  }

  return defaultMessage;
}

export function getDefaultApiFailureMessage(result) {
  if (result?.timedOut) {
    return "The API request timed out. Try again or check whether the backend is still processing.";
  }

  if (result?.aborted) {
    return "The API request was cancelled.";
  }

  if (result?.networkError) {
    return "The API could not be reached.\nCheck your network connection or API availability.";
  }

  if (result?.isUnauthorized) {
    return "You are not authenticated or your session has expired.";
  }

  if (result?.isForbidden) {
    return "You do not have permission to perform this action.";
  }

  if (result?.status === 404) {
    return "The requested product or endpoint was not found.";
  }

  if (result?.status >= 500) {
    return "The server returned an unexpected error.";
  }

  if (result?.statusText) {
    return result.statusText;
  }

  return "The request failed.";
}

function getObjectMessage(source) {
  const directMessage = getFirstStringValue(source, MESSAGE_KEYS);

  if (directMessage) {
    return directMessage;
  }

  const title = getFirstStringValue(source, TITLE_KEYS);
  const errors = getErrorsMessage(source);

  if (title && errors) {
    return `${title}: ${errors}`;
  }

  if (errors) {
    return errors;
  }

  if (title) {
    return title;
  }

  const nestedMessage =
    getNestedObjectMessage(source.data) ??
    getNestedObjectMessage(source.Data) ??
    getNestedObjectMessage(source.result) ??
    getNestedObjectMessage(source.Result) ??
    getNestedObjectMessage(source.error) ??
    getNestedObjectMessage(source.Error);

  return nestedMessage;
}

function getNestedObjectMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return getObjectMessage(value);
}

function getErrorsMessage(source) {
  for (const key of ERRORS_KEYS) {
    if (!Object.hasOwn(source, key)) {
      continue;
    }

    const message = formatErrors(source[key]);

    if (message) {
      return message;
    }
  }

  return null;
}

function formatErrors(errors) {
  if (!errors) {
    return null;
  }

  if (typeof errors === "string" && errors.trim()) {
    return errors.trim();
  }

  if (Array.isArray(errors)) {
    return errors.map(formatErrorValue).filter(Boolean).join(" ");
  }

  if (typeof errors === "object") {
    return Object.entries(errors)
      .map(([field, value]) => formatFieldError(field, value))
      .filter(Boolean)
      .join(" ");
  }

  return null;
}

function formatFieldError(field, value) {
  const message = formatErrorValue(value);

  if (!message) {
    return null;
  }

  const normalizedField = String(field ?? "").trim();

  if (!normalizedField || normalizedField === "$") {
    return message;
  }

  return `${normalizedField}: ${message}`;
}

function formatErrorValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(formatErrorValue).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    return getObjectMessage(value);
  }

  return String(value);
}

function getFirstStringValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function truncateMessage(message, maxLength) {
  if (!message) {
    return null;
  }

  const normalizedMessage = String(message).trim();

  if (normalizedMessage.length <= maxLength) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, maxLength - 1).trimEnd()}…`;
}
