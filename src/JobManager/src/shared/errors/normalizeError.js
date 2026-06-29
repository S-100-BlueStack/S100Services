const DEFAULT_ERROR_MESSAGE = "Something went wrong.";

export function normalizeError(error, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  if (error?.isNormalizedError) {
    return error;
  }

  if (typeof error === "string") {
    return createNormalizedError({
      message: error,
    });
  }

  if (error instanceof Error) {
    return createNormalizedError({
      name: error.name,
      message: error.message || fallbackMessage,
    });
  }

  if (error && typeof error === "object") {
    return createNormalizedError({
      name: error.name,
      message: error.userMessage || error.message || fallbackMessage,
      status: error.status || error.statusCode,
      code: error.code,
    });
  }

  return createNormalizedError({
    message: fallbackMessage,
  });
}

function createNormalizedError({ name, message, status, code }) {
  return {
    isNormalizedError: true,
    name: name || "Error",
    message: message || DEFAULT_ERROR_MESSAGE,
    status: status || null,
    code: code || null,
  };
}
