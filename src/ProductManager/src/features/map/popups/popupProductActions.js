import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";
import {
  noticeApiFailure,
  noticeApiSuccess,
  noticeUnexpectedApiError,
} from "../../notices/services/apiNoticeService.js";
import { noticeError } from "../../notices/services/noticeService.js";
import {
  PRODUCT_OPERATION_TYPE,
  beginProductOperation,
  endProductOperation,
} from "../../products/state/productOperationState.js";
import { openProductHistoryPanel as dispatchProductHistoryOpen } from "../../timeline/events/productHistoryEvents.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";
import { beginPopupExportAction, endPopupExportAction } from "./popupExportState.js";

export function openAnalyzePage(datasetName) {
  if (!datasetName) {
    noticeError("Cannot analyze product", "The selected feature does not have a datasetName.");
    return;
  }

  const analyzeUrl = buildAnalyzeUrl([datasetName]);
  const openedWindow = window.open(analyzeUrl, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError("Analyze page was blocked", "Allow popups for this site and try again.");
  }
}

export function openProductHistory(datasetName) {
  if (!datasetName) {
    noticeError("Cannot open history", "The selected feature does not have a datasetName.");
    return;
  }

  dispatchProductHistoryOpen(datasetName, {
    source: "popup",
  });
}

export async function triggerFreeze(datasetName, state, anchorElement, { afterResult } = {}) {
  if (!datasetName) {
    noticeError("Cannot change freeze state", "The selected feature does not have a datasetName.");
    return null;
  }

  const operationType = state ? PRODUCT_OPERATION_TYPE.FREEZE : PRODUCT_OPERATION_TYPE.UNFREEZE;
  const operationLabel = state ? "Freezing" : "Unfreezing";
  const actionLabel = state ? "freezing" : "unfreezing";
  let runningOperation = null;

  try {
    const confirmed = await confirmAction({
      title: `${state ? "Freeze" : "Unfreeze"} ${datasetName}`,
      message: `Are you sure you want to ${
        state ? "freeze" : "unfreeze"
      } ${datasetName}? Freezing a product will prevent it from being sent to IC-ENC until it is unfrozen.`,
      confirmText: "Confirm",
      cancelText: "Cancel",
      anchorElement,
    });

    if (!confirmed) {
      return null;
    }

    runningOperation = beginProductOperation({
      datasetName,
      type: operationType,
      label: operationLabel,
    });

    if (!runningOperation.started) {
      noticeError(
        "Product operation is already running",
        runningOperation.reason ?? `${operationLabel} is already running for ${datasetName}.`
      );

      return {
        success: false,
        skipped: true,
        reason: "already-running",
      };
    }

    const result = await changeFreezeState(datasetName, state);

    if (result.success) {
      noticeApiSuccess(`Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`);
      return await finishProductActionResult(result, afterResult);
    }

    noticeApiFailure(result, {
      networkTitle: `Network error while ${actionLabel} ${datasetName}`,
      failureTitle: `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName}`,
    });

    return await finishProductActionResult(result, afterResult);
  } catch (error) {
    noticeUnexpectedApiError(error, {
      title: `Unexpected error while ${actionLabel} ${datasetName}`,
    });

    return await finishProductActionResult(
      {
        success: false,
        error,
      },
      afterResult
    );
  } finally {
    if (runningOperation?.started) {
      endProductOperation(runningOperation.key);
    }
  }
}

export async function sendImmediately(datasetName, anchorElement, { afterResult } = {}) {
  if (!datasetName) {
    noticeError("Cannot send product", "The selected feature does not have a datasetName.");
    return null;
  }

  let runningOperation = null;

  try {
    const confirmed = await confirmAction({
      title: `Send ${datasetName}`,
      message: `Are you sure you want to send ${datasetName} immediately? This will upload the product to IC-ENC immediately without waiting for the automated upload.`,
      confirmText: "Send",
      cancelText: "Cancel",
      anchorElement,
    });

    if (!confirmed) {
      return null;
    }

    runningOperation = beginProductOperation({
      datasetName,
      type: PRODUCT_OPERATION_TYPE.SEND,
      label: "Sending",
    });

    if (!runningOperation.started) {
      noticeError(
        "Product operation is already running",
        runningOperation.reason ?? `Sending is already running for ${datasetName}.`
      );

      return {
        success: false,
        skipped: true,
        reason: "already-running",
      };
    }

    const result = await uploadProduct(datasetName);

    if (result.success) {
      noticeApiSuccess(`Product ${datasetName} sent successfully`);
      return await finishProductActionResult(result, afterResult);
    }

    noticeApiFailure(result, {
      networkTitle: `Network error while sending ${datasetName}`,
      failureTitle: `Failed to send ${datasetName}`,
    });

    return await finishProductActionResult(result, afterResult);
  } catch (error) {
    noticeUnexpectedApiError(error, {
      title: `Unexpected error while sending ${datasetName}`,
    });

    return await finishProductActionResult(
      {
        success: false,
        error,
      },
      afterResult
    );
  } finally {
    if (runningOperation?.started) {
      endProductOperation(runningOperation.key);
    }
  }
}

export async function triggerExport({
  datasetName,
  scope,
  exportType,
  request,
  anchorElement,
  confirm,
  afterResult,
}) {
  if (!datasetName) {
    noticeError("Cannot export product", "The selected feature does not have a datasetName.");
    return null;
  }

  if (typeof request !== "function") {
    noticeError(
      "Export is not configured",
      `${scope} ${exportType} does not have an export endpoint configured yet.`
    );
    return null;
  }

  const exportLabel = `${scope} ${exportType}`;
  let runningExport = null;
  let runningOperation = null;

  try {
    const confirmed = await confirmAction({
      title: confirm?.title ?? `Export ${exportLabel} for ${datasetName}`,
      message:
        confirm?.message ??
        `Are you sure you want to export ${exportLabel.toLowerCase()} for ${datasetName}?`,
      confirmText: confirm?.confirmText ?? "Export",
      cancelText: confirm?.cancelText ?? "Cancel",
      anchorElement,
    });

    if (!confirmed) {
      return null;
    }

    runningExport = beginPopupExportAction({
      datasetName,
      scope,
      exportType,
    });

    if (!runningExport.started) {
      noticeError(
        "Export is already running",
        runningExport.reason ?? `${exportLabel} is already running for ${datasetName}.`
      );

      return {
        success: false,
        skipped: true,
        reason: "already-running",
      };
    }

    runningOperation = beginProductOperation({
      datasetName,
      type: PRODUCT_OPERATION_TYPE.EXPORT,
      label: `Exporting ${exportLabel}`,
      operationId: `${scope}:${exportType}`,
      allowConcurrentSameType: true,
    });

    if (!runningOperation.started) {
      endPopupExportAction(runningExport.key);
      runningExport = null;

      noticeError(
        "Product operation is already running",
        runningOperation.reason ??
          `Another product operation is already running for ${datasetName}.`
      );

      return {
        success: false,
        skipped: true,
        reason: "already-running",
      };
    }

    const result = await request(datasetName);

    if (result.success) {
      noticeApiSuccess(`Export request sent for ${datasetName}`, exportLabel);
      return await finishProductActionResult(result, afterResult);
    }

    noticeApiFailure(result, {
      networkTitle: `Network error while exporting ${datasetName}`,
      failureTitle: `Failed to export ${datasetName}`,
      fallbackMessage: exportLabel,
    });

    return await finishProductActionResult(result, afterResult);
  } catch (error) {
    noticeUnexpectedApiError(error, {
      title: `Unexpected error while exporting ${datasetName}`,
    });

    return await finishProductActionResult(
      {
        success: false,
        error,
      },
      afterResult
    );
  } finally {
    if (runningOperation?.started) {
      endProductOperation(runningOperation.key);
    }

    if (runningExport?.started) {
      endPopupExportAction(runningExport.key);
    }
  }
}

async function finishProductActionResult(result, afterResult) {
  if (shouldRunPostAction(result)) {
    await afterResult?.(result);
  }

  return result;
}

function shouldRunPostAction(result) {
  return Boolean(result && result.skipped !== true);
}
