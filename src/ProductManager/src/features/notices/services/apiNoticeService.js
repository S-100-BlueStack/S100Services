import {
  getApiFailureTitle,
  getApiResultMessage,
  getErrorMessage,
} from "../../../shared/api/apiResult.js";
import { noticeError, noticeSuccess } from "./noticeService.js";

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

  noticeError(title, message, options);
}

export function noticeUnexpectedApiError(
  error,
  { title = "Unexpected error", fallbackMessage = "Unknown error.", options = {} } = {}
) {
  noticeError(title, getErrorMessage(error, fallbackMessage), options);
}

function getDefaultApiFailureMessage(result) {
  if (result?.networkError) {
    return "The API could not be reached. Check your network connection or API availability.";
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
