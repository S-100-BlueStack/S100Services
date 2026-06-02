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

  const message = getApiResultMessage(result) ?? fallbackMessage;

  noticeError(title, message, options);
}

export function noticeUnexpectedApiError(
  error,
  { title = "Unexpected error", fallbackMessage = "Unknown error.", options = {} } = {}
) {
  noticeError(title, getErrorMessage(error, fallbackMessage), options);
}
