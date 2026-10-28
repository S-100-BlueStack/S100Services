import {
  getApiFailureTitle,
  getApiResultMessage,
  getDefaultApiFailureMessage,
  getErrorMessage,
} from "../../../shared/api/apiResult.js";
import { noticeError, noticeSuccess } from "./noticeService.js";

const API_FAILURE_DEDUPE_MS = 30 * 1000;

export function noticeApiSuccess(title, message = null, options = {}) {
  noticeSuccess(title, message, {
    countAsUnread: false,
    ...options,
  });
}

export function noticeApiFailure(
  result,
  {
    networkTitle = "Network error",
    failureTitle = "Request failed",
    fallbackMessage = null,
    options = {},
  } = {}
) {
  const title = result?.networkError ? networkTitle : getApiFailureTitle(result, failureTitle);
  const message =
    getApiResultMessage(result) ?? fallbackMessage ?? getDefaultApiFailureMessage(result);

  noticeError(title, message, {
    dedupeKey: options.dedupeKey ?? createApiFailureDedupeKey(result, title),
    dedupeMs: options.dedupeMs ?? API_FAILURE_DEDUPE_MS,
    ...options,
  });
}

export function noticeUnexpectedApiError(
  error,
  { title = "Unexpected error", fallbackMessage = "Unknown error.", options = {} } = {}
) {
  const message = getErrorMessage(error, fallbackMessage);

  noticeError(title, message, {
    dedupeKey: options.dedupeKey ?? createUnexpectedErrorDedupeKey(title, message),
    dedupeMs: options.dedupeMs ?? API_FAILURE_DEDUPE_MS,
    ...options,
  });
}

function createApiFailureDedupeKey(result, title) {
  return [
    "api-failure",
    title,
    result?.status,
    result?.networkError ? "network" : null,
    result?.timedOut ? "timeout" : null,
    result?.aborted ? "aborted" : null,
  ]
    .filter(Boolean)
    .join(":");
}

function createUnexpectedErrorDedupeKey(title, message) {
  return ["unexpected-error", title, message].filter(Boolean).join(":");
}
