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
  dataReceivedProgress = 0.18,
  renderStartProgress = 0.2,
  renderEndProgress = 0.96,
  loadingMessagesStage = "loadingData",
  renderingMessagesStage = "renderingMap",
  showLoaderOnStart = false,
  showLoaderDelayMs = 0,
  completionHoldMs = 0,
} = {}) {
  let retryCountdownIntervalId = null;
  let delayedShowTimeoutId = null;

  let loaderWasShownBySession = false;
  let currentText = null;
  let currentProgress = null;
  let currentProgressLabel = null;
  let currentWaiting = false;
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
    currentWaiting = true;
    setSessionProgress(null, { label: "Working..." });

    if (showLoaderOnStart) {
      scheduleLoaderShow();
    } else {
      applyCurrentLoaderState();
    }

    startSessionTextRotation(loadingMessagesStage, rotateImmediately);
  }

  function startRetryCountdown({ attempt, totalAttempts, delayMs }) {
    if (!isCurrentSession()) return;
    stopRetryCountdown();
    stopSessionTextRotation();
    currentWaiting = false;

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
    currentWaiting = false;
    setSessionProgress(dataReceivedProgress);
  }

  function startRendering({ text } = {}) {
    if (!isCurrentSession()) return;

    if (shouldShowTechnicalLoadingStages() && text) {
      setSessionText(text);
    }

    startSessionTextRotation(renderingMessagesStage, true);
    currentWaiting = true;
    setSessionProgress(renderStartProgress, { label: "Rendering..." });
  }

  function handleRenderProgress({ progress, stage, layerTitle } = {}) {
    if (!isCurrentSession()) return;
    const normalizedProgress = clamp(progress ?? 0, 0, 1);
    const loaderProgress =
      renderStartProgress + normalizedProgress * (renderEndProgress - renderStartProgress);

    currentWaiting = false;
    setSessionProgress(loaderProgress);

    if (shouldShowTechnicalLoadingStages() && stage && layerTitle) {
      setSessionText(`${stage} (${layerTitle})...`);
    }
  }

  function updateProgressStage({
    progress,
    text,
    label = null,
    preserveProgress = false,
    waiting = true,
  } = {}) {
    if (!isCurrentSession()) return;
    stopRetryCountdown();
    stopSessionTextRotation();

    if (text) {
      setSessionText(text);
    }
    // Keep measured stage progress, but animate activity while backend/map work
    // has no meaningful percentage. Never advance the value based on elapsed time.
    currentWaiting = Boolean(waiting);
    if (preserveProgress) {
      currentProgressLabel = label ?? "Working...";
      applyCurrentLoaderState();
    } else {
      setSessionProgress(progress, { label: label ?? (currentWaiting ? "Working..." : null) });
    }
  }

  function complete({ text = "Ready", hide = true } = {}) {
    if (!isCurrentSession()) {
      cleanup();
      return;
    }
    cleanup();
    currentWaiting = false;

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
    currentWaiting = false;

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
        waiting: currentWaiting,
      });
    }
  }

  function applyCurrentLoaderState() {
    if (currentText !== null) {
      setLoaderText(currentText);
    }

    setLoaderProgress(currentProgress, {
      label: currentProgressLabel,
      waiting: currentWaiting,
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
