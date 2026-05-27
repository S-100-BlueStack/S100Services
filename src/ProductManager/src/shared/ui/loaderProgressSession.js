import {
  hideLoader,
  setLoaderProgress,
  setLoaderText,
  showLoader,
  startLoaderTextRotation,
  stopLoaderTextRotation,
} from "./loader.js";
import {
  getLoadingMessages,
  loadingMessageIntervalMs,
  loadingTextMode,
  shouldRotateLoadingMessages,
  shouldShowTechnicalLoadingStages,
} from "../config/loadingTextConfig.js";

export function createLoaderProgressSession({
  loadStartProgress = 0.03,
  loadEndProgress = 0.16,
  dataReceivedProgress = 0.18,
  renderStartProgress = 0.2,
  renderEndProgress = 0.96,
  simulatedProgressIntervalMs = 350,
  simulatedProgressStep = 0.012,
  loadingMessagesStage = "loadingData",
  renderingMessagesStage = "renderingMap",
  showLoaderOnStart = false,
  showLoaderDelayMs = 0,
} = {}) {
  let retryCountdownIntervalId = null;
  let simulatedProgressIntervalId = null;
  let delayedShowTimeoutId = null;

  let loaderWasShownBySession = false;
  let currentText = null;
  let currentProgress = null;
  let currentProgressLabel = null;
  let pendingTextRotation = null;

  return {
    startLoading,
    startRetryCountdown,
    stopRetryCountdown,
    markDataReceived,
    startRendering,
    handleRenderProgress,
    complete,
    fail,
    cleanup,
  };

  function startLoading(text, { rotateImmediately = false } = {}) {
    simulatedProgressIntervalId = null;
    currentText = text;
    setSessionProgress(loadStartProgress);

    if (showLoaderOnStart) {
      scheduleLoaderShow();
    } else {
      applyCurrentLoaderState();
    }

    startSessionTextRotation(loadingMessagesStage, rotateImmediately);
    startSimulatedProgress();
  }

  function startRetryCountdown({ attempt, totalAttempts, delayMs }) {
    stopRetryCountdown();
    stopSimulatedProgress();
    stopSessionTextRotation();

    // Retry waits are long enough that hiding the loader would make the app
    // look idle, so show the delayed loader immediately when retrying.
    if (showLoaderOnStart && !loaderWasShownBySession) {
      showSessionLoader();
    }

    const startedAt = Date.now();

    const updateCountdownText = () => {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, delayMs - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      setSessionText(
        `Retrying data load (${attempt}/${totalAttempts})...\nNext attempt in ${remainingSeconds}s`
      );

      // Retry waiting is intentionally indeterminate because no useful work is happening.
      setSessionProgress(null, { label: null });
    };

    updateCountdownText();

    retryCountdownIntervalId = window.setInterval(() => {
      updateCountdownText();

      if (Date.now() - startedAt >= delayMs) {
        stopRetryCountdown();
      }
    }, 1000);
  }

  function stopRetryCountdown() {
    if (retryCountdownIntervalId === null) {
      return;
    }

    window.clearInterval(retryCountdownIntervalId);
    retryCountdownIntervalId = null;
  }

  function markDataReceived() {
    stopRetryCountdown();
    stopSimulatedProgress();
    setSessionProgress(dataReceivedProgress);
  }

  function startRendering({ text } = {}) {
    stopSimulatedProgress();

    if (shouldShowTechnicalLoadingStages() && text) {
      setSessionText(text);
    }

    startSessionTextRotation(renderingMessagesStage, true);
    setSessionProgress(renderStartProgress);
  }

  function handleRenderProgress({ progress, stage, layerTitle } = {}) {
    const normalizedProgress = clamp(progress ?? 0, 0, 1);
    const loaderProgress =
      renderStartProgress + normalizedProgress * (renderEndProgress - renderStartProgress);

    setSessionProgress(loaderProgress);

    if (shouldShowTechnicalLoadingStages() && stage && layerTitle) {
      setSessionText(`${stage} (${layerTitle})...`);
    }
  }

  function complete({ text = "Ready", hide = true } = {}) {
    cleanup();
    setSessionText(text);
    setSessionProgress(1);

    if (hide) {
      hideLoader();
      loaderWasShownBySession = false;
    }
  }

  function fail({ text = "Failed to load data", label = "Failed", hideAfterMs = 1500 } = {}) {
    cleanup();

    setSessionText(text);
    setSessionProgress(1, { label });

    // Fast failures should still be visible to the user, even if the delayed
    // loader was never shown during the request.
    if (showLoaderOnStart && !loaderWasShownBySession) {
      showSessionLoader();
    }

    if (hideAfterMs !== null) {
      window.setTimeout(() => {
        hideLoader();
        loaderWasShownBySession = false;
      }, hideAfterMs);
    }
  }

  function cleanup() {
    stopRetryCountdown();
    stopSimulatedProgress();
    stopSessionTextRotation();
    cancelDelayedLoaderShow();
  }

  function scheduleLoaderShow() {
    if (!showLoaderOnStart || loaderWasShownBySession || delayedShowTimeoutId !== null) {
      return;
    }

    if (showLoaderDelayMs <= 0) {
      showSessionLoader();
      return;
    }

    delayedShowTimeoutId = window.setTimeout(() => {
      showSessionLoader();
    }, showLoaderDelayMs);
  }

  function showSessionLoader() {
    cancelDelayedLoaderShow();

    loaderWasShownBySession = true;

    showLoader(currentText ?? "Loading...", {
      progress: currentProgress,
    });

    applyCurrentLoaderState();
    startPendingTextRotation();
  }

  function cancelDelayedLoaderShow() {
    if (delayedShowTimeoutId === null) {
      return;
    }

    window.clearTimeout(delayedShowTimeoutId);
    delayedShowTimeoutId = null;
  }

  function startSessionTextRotation(stage, rotateImmediately) {
    if (!shouldRotateLoadingMessages()) {
      return;
    }

    pendingTextRotation = {
      messages: getLoadingMessages(stage, loadingTextMode),
      rotateImmediately,
    };

    if (showLoaderOnStart && !loaderWasShownBySession) {
      return;
    }

    startPendingTextRotation();
  }

  function startPendingTextRotation() {
    if (!pendingTextRotation) {
      return;
    }

    startLoaderTextRotation(pendingTextRotation.messages, {
      intervalMs: loadingMessageIntervalMs,
      immediate: pendingTextRotation.rotateImmediately,
    });

    pendingTextRotation = null;
  }

  function stopSessionTextRotation() {
    pendingTextRotation = null;
    stopLoaderTextRotation();
  }

  function startSimulatedProgress() {
    stopSimulatedProgress();

    simulatedProgressIntervalId = window.setInterval(() => {
      setSessionProgress(Math.min(loadEndProgress, currentProgress + simulatedProgressStep));

      if (currentProgress >= loadEndProgress) {
        stopSimulatedProgress();
      }
    }, simulatedProgressIntervalMs);
  }

  function stopSimulatedProgress() {
    if (simulatedProgressIntervalId === null) {
      return;
    }

    window.clearInterval(simulatedProgressIntervalId);
    simulatedProgressIntervalId = null;
  }

  function setSessionText(text) {
    currentText = text;

    if (!showLoaderOnStart || loaderWasShownBySession) {
      setLoaderText(text);
    }
  }

  function setSessionProgress(progress, { label = null } = {}) {
    currentProgress = progress;
    currentProgressLabel =
      label ??
      (typeof progress === "number" ? `${Math.round(clamp(progress, 0, 1) * 100)}%` : null);

    if (!showLoaderOnStart || loaderWasShownBySession) {
      setLoaderProgress(progress, {
        label: currentProgressLabel,
      });
    }
  }

  function applyCurrentLoaderState() {
    if (currentText !== null) {
      setLoaderText(currentText);
    }

    setLoaderProgress(currentProgress, {
      label: currentProgressLabel,
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
