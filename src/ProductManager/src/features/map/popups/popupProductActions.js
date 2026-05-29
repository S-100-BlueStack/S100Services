import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";
import { noticeError, noticeSuccess } from "../../notices/services/noticeService.js";
import { openProductHistoryPanel as dispatchProductHistoryOpen } from "../../timeline/events/productHistoryEvents.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";

const activeFreezeActionIds = new Set();
const activeSendActionIds = new Set();
const activeExportActionIds = new Set();

export function openAnalyzePage(datasetName) {
  if (!datasetName) {
    noticeError("Cannot analyze product", "The selected feature does not have a datasetName.");
    return;
  }

  const analyzeUrl = buildAnalyzeUrl([datasetName]);
  const openedWindow = window.open(analyzeUrl, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError(
      "Analyze page was blocked",
      "The browser blocked the new tab. Allow popups for this site and try again."
    );
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

export async function triggerFreeze(datasetName, state, anchorElement) {
  if (!datasetName) {
    noticeError("Cannot change freeze state", "The selected feature does not have a datasetName.");
    return null;
  }

  const actionKey = `${datasetName}:${state ? "freeze" : "unfreeze"}`;

  if (activeFreezeActionIds.has(actionKey)) {
    return {
      success: false,
      skipped: true,
      reason: "already-running",
    };
  }

  activeFreezeActionIds.add(actionKey);

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

    const result = await changeFreezeState(datasetName, state);

    if (result.success) {
      noticeSuccess(`Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`, null, {
        countAsUnread: false,
      });
    } else if (result.networkError) {
      noticeError(`Network error while ${state ? "freezing" : "unfreezing"} ${datasetName}`);
    } else {
      noticeError(
        `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName} (${result.status})`,
        `${result.statusText}`
      );
    }

    return result;
  } catch (error) {
    noticeError(
      `Unexpected error while ${state ? "freezing" : "unfreezing"} ${datasetName}`,
      getErrorMessage(error)
    );

    return {
      success: false,
      error,
    };
  } finally {
    activeFreezeActionIds.delete(actionKey);
  }
}

export async function sendImmediately(datasetName, anchorElement) {
  if (!datasetName) {
    noticeError("Cannot send product", "The selected feature does not have a datasetName.");
    return null;
  }

  const actionKey = datasetName;

  if (activeSendActionIds.has(actionKey)) {
    return {
      success: false,
      skipped: true,
      reason: "already-running",
    };
  }

  activeSendActionIds.add(actionKey);

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

    const result = await uploadProduct(datasetName);

    if (result.success) {
      noticeSuccess(`Product ${datasetName} sent successfully`, null, {
        countAsUnread: false,
      });
    } else if (result.networkError) {
      noticeError(`Network error while sending ${datasetName}`);
    } else {
      noticeError(`Failed to send ${datasetName} (${result.status})`, `${result.statusText}`);
    }

    return result;
  } catch (error) {
    noticeError(`Unexpected error while sending ${datasetName}`, getErrorMessage(error));

    return {
      success: false,
      error,
    };
  } finally {
    activeSendActionIds.delete(actionKey);
  }
}

export async function triggerExport({
  actionId,
  datasetName,
  scope,
  exportType,
  request,
  anchorElement,
  confirm,
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
  const actionKey = `${datasetName}:${actionId}`;

  if (activeExportActionIds.has(actionKey)) {
    return {
      success: false,
      skipped: true,
      reason: "already-running",
    };
  }

  activeExportActionIds.add(actionKey);

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

    const result = await request(datasetName);

    if (result.success) {
      noticeSuccess(`Export request sent for ${datasetName}`, exportLabel, {
        countAsUnread: false,
      });
    } else if (result.networkError) {
      noticeError(`Network error while exporting ${datasetName}`, exportLabel);
    } else {
      noticeError(
        `Failed to export ${datasetName} (${result.status})`,
        getApiResultMessage(result) ?? exportLabel
      );
    }

    return result;
  } catch (error) {
    noticeError(`Unexpected error while exporting ${datasetName}`, getErrorMessage(error));

    return {
      success: false,
      error,
    };
  } finally {
    activeExportActionIds.delete(actionKey);
  }
}

function getApiResultMessage(result) {
  if (!result) {
    return null;
  }

  if (typeof result.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage;
  }

  if (typeof result.statusText === "string" && result.statusText.trim()) {
    return result.statusText;
  }

  if (typeof result.data === "string" && result.data.trim()) {
    return result.data;
  }

  if (result.data && typeof result.data === "object") {
    return (
      result.data.message ??
      result.data.Message ??
      result.data.error ??
      result.data.Error ??
      result.data.title ??
      result.data.Title ??
      null
    );
  }

  return null;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error.";
}
