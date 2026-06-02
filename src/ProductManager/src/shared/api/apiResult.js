const MESSAGE_KEYS = [
  "errorMessage",
  "message",
  "Message",
  "error",
  "Error",
  "title",
  "Title",
  "detail",
  "Detail",
];

export function getApiResultMessage(result) {
  if (!result) {
    return null;
  }

  const directMessage = getFirstStringValue(result, MESSAGE_KEYS);

  if (directMessage) {
    return directMessage;
  }

  if (typeof result.data === "string" && result.data.trim()) {
    return result.data.trim();
  }

  if (result.data && typeof result.data === "object") {
    return getFirstStringValue(result.data, MESSAGE_KEYS);
  }

  if (typeof result.statusText === "string" && result.statusText.trim()) {
    return result.statusText.trim();
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
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallbackMessage;
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
