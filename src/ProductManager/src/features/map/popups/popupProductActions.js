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

  return runConfirmedProductOperation({
    datasetName,
    confirm: {
      title: `${state ? "Freeze" : "Unfreeze"} ${datasetName}`,
      message: `Are you sure you want to ${
        state ? "freeze" : "unfreeze"
      } ${datasetName}? Freezing a product will prevent it from being sent to IC-ENC until it is unfrozen.`,
      confirmText: "Confirm",
      cancelText: "Cancel",
      anchorElement,
    },
    operation: {
      type: operationType,
      label: operationLabel,
    },
    execute: () => changeFreezeState(datasetName, state),
    onSuccess: () => {
      noticeApiSuccess(`Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`);
    },
    failureNotice: {
      networkTitle: `Network error while ${actionLabel} ${datasetName}`,
      failureTitle: `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName}`,
    },
    unexpectedErrorTitle: `Unexpected error while ${actionLabel} ${datasetName}`,
    afterResult,
  });
}

export async function sendImmediately(datasetName, anchorElement, { afterResult } = {}) {
  if (!datasetName) {
    noticeError("Cannot send product", "The selected feature does not have a datasetName.");
    return null;
  }

  return runConfirmedProductOperation({
    datasetName,
    confirm: {
      title: `Send ${datasetName}`,
      message: `Are you sure you want to send ${datasetName} immediately? This will upload the product to IC-ENC immediately without waiting for the automated upload.`,
      confirmText: "Send",
      cancelText: "Cancel",
      anchorElement,
    },
    operation: {
      type: PRODUCT_OPERATION_TYPE.SEND,
      label: "Sending",
    },
    execute: () => uploadProduct(datasetName),
    onSuccess: () => {
      noticeApiSuccess(`Product ${datasetName} sent successfully`);
    },
    failureNotice: {
      networkTitle: `Network error while sending ${datasetName}`,
      failureTitle: `Failed to send ${datasetName}`,
    },
    unexpectedErrorTitle: `Unexpected error while sending ${datasetName}`,
    afterResult,
  });
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

  return runConfirmedExportOperation({
    datasetName,
    scope,
    exportType,
    exportLabel,
    request,
    confirm: {
      title: confirm?.title ?? `Export ${exportLabel} for ${datasetName}`,
      message:
        confirm?.message ??
        `Are you sure you want to export ${exportLabel.toLowerCase()} for ${datasetName}?`,
      confirmText: confirm?.confirmText ?? "Export",
      cancelText: confirm?.cancelText ?? "Cancel",
      anchorElement,
    },
    afterResult,
  });
}

async function runConfirmedProductOperation({
  datasetName,
  confirm,
  operation,
  execute,
  onSuccess,
  failureNotice,
  unexpectedErrorTitle,
  afterResult,
}) {
  let runningOperation = null;

  try {
    const confirmed = await confirmAction(confirm);

    if (!confirmed) {
      return null;
    }

    runningOperation = beginProductOperation({
      datasetName,
      type: operation.type,
      label: operation.label,
      operationId: operation.operationId,
      allowConcurrentSameType: operation.allowConcurrentSameType,
    });

    if (!runningOperation.started) {
      noticeError(
        "Product operation is already running",
        runningOperation.reason ?? `${operation.label} is already running for ${datasetName}.`
      );

      return createSkippedActionResult("already-running");
    }

    const result = await execute();

    if (result.success) {
      onSuccess?.(result);
    } else {
      noticeApiFailure(result, failureNotice);
    }

    return await finishProductActionResult(result, afterResult);
  } catch (error) {
    noticeUnexpectedApiError(error, {
      title: unexpectedErrorTitle,
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

async function runConfirmedExportOperation({
  datasetName,
  scope,
  exportType,
  exportLabel,
  request,
  confirm,
  afterResult,
}) {
  let runningExport = null;
  let runningOperation = null;

  try {
    const confirmed = await confirmAction(confirm);

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

      return createSkippedActionResult("already-running");
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

      return createSkippedActionResult("already-running");
    }

    const result = await request(datasetName);

    if (result.success) {
      noticeApiSuccess(`Export request sent for ${datasetName}`, exportLabel);
    } else {
      noticeApiFailure(result, {
        networkTitle: `Network error while exporting ${datasetName}`,
        failureTitle: `Failed to export ${datasetName}`,
        fallbackMessage: exportLabel,
      });
    }

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

function createSkippedActionResult(reason) {
  return {
    success: false,
    skipped: true,
    reason,
  };
}
