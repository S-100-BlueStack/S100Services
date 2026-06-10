import { getApiResultErrorMessage } from "./apiResult.js";

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "/");
const REQUEST_TIMEOUT_DISABLED = 0;

function normalizeBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function buildUrl(path) {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");

  if (!normalizedPath) {
    return API_BASE_URL || "/";
  }

  if (isAbsoluteUrl(normalizedPath)) {
    return normalizedPath;
  }

  if (!API_BASE_URL) {
    return `/${normalizedPath}`;
  }

  return `${API_BASE_URL}/${normalizedPath}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");

  let data = null;

  try {
    if (response.status !== 204) {
      data = isJson ? await response.json() : await response.text();
    }
  } catch {
    data = null;
  }

  if (response.ok) {
    return {
      success: true,
      status: response.status,
      data,
    };
  }

  return {
    success: false,
    status: response.status,
    statusText: response.statusText,
    data,
    isUnauthorized: response.status === 401,
    isForbidden: response.status === 403,
  };
}

export async function apiRequest(path, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_DISABLED, signal, ...fetchOptions } = options;
  const abortContext = createAbortContext({ signal, timeoutMs });

  try {
    const response = await fetch(buildUrl(path), {
      credentials: "include",
      ...fetchOptions,
      signal: abortContext.signal,
      headers: {
        Accept: "application/json",
        ...(fetchOptions.headers ?? {}),
      },
    });

    return await parseResponse(response);
  } catch (error) {
    return {
      success: false,
      networkError: true,
      aborted: abortContext.wasAborted(),
      timedOut: abortContext.wasTimedOut(),
      errorMessage: getNetworkErrorMessage(error, abortContext),
    };
  } finally {
    abortContext.cleanup();
  }
}

export async function apiGet(path, defaultMessage = "Request failed", options = {}) {
  const result = await apiRequest(path, options);

  if (!result.success) {
    throw new Error(getApiResultErrorMessage(result, defaultMessage));
  }

  return result.data;
}

function createAbortContext({ signal, timeoutMs }) {
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const hasTimeout = normalizedTimeoutMs > REQUEST_TIMEOUT_DISABLED;

  if (!hasTimeout && !signal) {
    return createStaticAbortContext({ signal: undefined });
  }

  if (!hasTimeout) {
    return createStaticAbortContext({ signal });
  }

  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    timeoutMs: normalizedTimeoutMs,
    timedOut: false,
    abortedByExternalSignal: false,
    cleanup,
    wasTimedOut,
    wasAborted,
  };

  const timeoutId = window.setTimeout(() => {
    context.timedOut = true;
    controller.abort();
  }, normalizedTimeoutMs);

  function abortFromExternalSignal() {
    context.abortedByExternalSignal = true;
    controller.abort();
  }

  if (signal?.aborted) {
    abortFromExternalSignal();
  } else {
    signal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  function cleanup() {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromExternalSignal);
  }

  function wasTimedOut() {
    return context.timedOut;
  }

  function wasAborted() {
    return context.timedOut || context.abortedByExternalSignal;
  }

  return context;
}

function createStaticAbortContext({ signal }) {
  return {
    signal,
    timeoutMs: REQUEST_TIMEOUT_DISABLED,
    cleanup() {},
    wasTimedOut() {
      return false;
    },
    wasAborted() {
      return Boolean(signal?.aborted);
    },
  };
}

function normalizeTimeoutMs(timeoutMs) {
  const numericTimeoutMs = Number(timeoutMs);

  if (!Number.isFinite(numericTimeoutMs) || numericTimeoutMs <= REQUEST_TIMEOUT_DISABLED) {
    return REQUEST_TIMEOUT_DISABLED;
  }

  return numericTimeoutMs;
}

function getNetworkErrorMessage(error, abortContext) {
  if (abortContext.wasTimedOut()) {
    return `Request timed out after ${formatTimeout(abortContext.timeoutMs)}.`;
  }

  if (abortContext.wasAborted()) {
    return "Request was cancelled.";
  }

  return error instanceof Error ? error.message : "Unknown network error";
}

function formatTimeout(timeoutMs) {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000} seconds`;
  }

  return `${timeoutMs} ms`;
}
