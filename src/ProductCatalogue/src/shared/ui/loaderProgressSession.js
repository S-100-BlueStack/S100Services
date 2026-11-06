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

// All progress sessions share the global loader. Completed sessions must not hide a
// newer session after its request has started.
let latestLoaderSessionRevision = 0;

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
  completionHoldMs = 0,
} = {}) {
  let retryCountdownIntervalId = null;
  let simulatedProgressIntervalId = null;
  let delayedShowTimeoutId = null;

  let loaderWasShownBySession = false;
  let currentText = null;
  let currentProgress = null;
  let currentProgressLabel = null;
  let pendingTextRotation = null;
  let failHideTimeoutId = null;
  let completionHideTimeoutId = null;
  let resolveCompletionHide = null;
  let sessionRevision = 0;

  return {
    startLoading,
    startRetryCountdown,
    stopRetryCountdown,
    markDataReceived,
    startRendering,
    handleRenderProgress,
    updateProgressStage,
    complete,
    fail,
    cleanup,
  };

  function isCurrentSession() {
    return sessionRevision !== 0 && sessionRevision === latestLoaderSessionRevision;
  }

  function startLoading(text, { rotateImmediately = false } = {}) {
    cleanup();
    sessionRevision = ++latestLoaderSessionRevision;

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
    if (!isCurrentSession()) return;
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
    if (!isCurrentSession()) return;
    stopRetryCountdown();
    stopSimulatedProgress();
    setSessionProgress(dataReceivedProgress);
  }

  function startRendering({ text } = {}) {
    if (!isCurrentSession()) return;
    stopSimulatedProgress();

    if (shouldShowTechnicalLoadingStages() && text) {
      setSessionText(text);
    }

    startSessionTextRotation(renderingMessagesStage, true);
    setSessionProgress(renderStartProgress);
  }

  function handleRenderProgress({ progress, stage, layerTitle } = {}) {
    if (!isCurrentSession()) return;
    const normalizedProgress = clamp(progress ?? 0, 0, 1);
    const loaderProgress =
      renderStartProgress + normalizedProgress * (renderEndProgress - renderStartProgress);

    setSessionProgress(loaderProgress);

    if (shouldShowTechnicalLoadingStages() && stage && layerTitle) {
      setSessionText(`${stage} (${layerTitle})...`);
    }
  }

  function updateProgressStage({ progress, text, label = null, preserveProgress = false } = {}) {
    if (!isCurrentSession()) return;
    stopRetryCountdown();
    stopSimulatedProgress();
    stopSessionTextRotation();

    if (text) {
      setSessionText(text);
    }
    // Map rendering has no measured percentage. Keep the existing bar at its
    // source-owned value instead of making it appear to restart.
    if (!preserveProgress) {
      setSessionProgress(progress, { label });
    }
  }

  function complete({ text = "Ready", hide = true } = {}) {
    if (!isCurrentSession()) {
      cleanup();
      return;
    }
    cleanup();

    setSessionText(text);
    setSessionProgress(1);

    if (!hide) {
      return;
    }

    const shouldHold =
      completionHoldMs > 0 &&
      (!showLoaderOnStart || loaderWasShownBySession) &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (shouldHold) {
      const completedRevision = sessionRevision;
      // Startup waits for the displayed completion before offering onboarding.
      // Cleanup resolves the wait as well, so superseded loads never hang.
      return new Promise((resolve) => {
        resolveCompletionHide = resolve;
        completionHideTimeoutId = window.setTimeout(() => {
          completionHideTimeoutId = null;
          resolveCompletionHide = null;
          if (completedRevision === latestLoaderSessionRevision) {
            hideLoader();
            loaderWasShownBySession = false;
          }
          resolve();
        }, completionHoldMs);
      });
    }

    hideLoader();
    loaderWasShownBySession = false;
  }

  function fail({ text = "Failed to load data", label = "Failed", hideAfterMs = 1500 } = {}) {
    if (!isCurrentSession()) {
      cleanup();
      return;
    }
    cleanup();

    setSessionText(text);
    setSessionProgress(1, { label });

    // Fast failures should still be visible to the user, even if the delayed
    // loader was never shown during the request.
    if (showLoaderOnStart && !loaderWasShownBySession) {
      showSessionLoader();
    }

    if (hideAfterMs !== null) {
      const failedRevision = sessionRevision;
      failHideTimeoutId = window.setTimeout(() => {
        failHideTimeoutId = null;
        if (failedRevision !== latestLoaderSessionRevision) {
          return;
        }
        hideLoader();
        loaderWasShownBySession = false;
      }, hideAfterMs);
    }
  }

  function cleanup() {
    stopRetryCountdown();
    stopSimulatedProgress();
    if (sessionRevision === 0 || isCurrentSession()) {
      stopSessionTextRotation();
    } else {
      pendingTextRotation = null;
    }
    cancelDelayedLoaderShow();
    cancelFailHide();
    cancelCompletionHide();
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
      delayedShowTimeoutId = null;
      if (isCurrentSession()) {
        showSessionLoader();
      }
    }, showLoaderDelayMs);
  }

  function showSessionLoader() {
    if (!isCurrentSession()) return;
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

  function cancelFailHide() {
    if (failHideTimeoutId === null) {
      return;
    }

    window.clearTimeout(failHideTimeoutId);
    failHideTimeoutId = null;
  }

  function cancelCompletionHide() {
    if (completionHideTimeoutId !== null) {
      window.clearTimeout(completionHideTimeoutId);
      completionHideTimeoutId = null;
    }

    const resolve = resolveCompletionHide;
    resolveCompletionHide = null;
    resolve?.();
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
      if (!isCurrentSession()) {
        stopSimulatedProgress();
        return;
      }
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
