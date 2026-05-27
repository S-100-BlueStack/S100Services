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
} = {}) {
  let retryCountdownIntervalId = null;
  let simulatedProgressIntervalId = null;
  let simulatedProgress = loadStartProgress;

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
    simulatedProgress = loadStartProgress;

    if (showLoaderOnStart) {
      showLoader(text, {
        progress: simulatedProgress,
      });
    } else {
      setLoaderText(text);
      setProgress(simulatedProgress);
    }

    if (shouldRotateLoadingMessages()) {
      startLoaderTextRotation(getLoadingMessages(loadingMessagesStage, loadingTextMode), {
        intervalMs: loadingMessageIntervalMs,
        immediate: rotateImmediately,
      });
    }

    startSimulatedProgress();
  }

  function startRetryCountdown({ attempt, totalAttempts, delayMs }) {
    stopRetryCountdown();
    stopSimulatedProgress();
    stopLoaderTextRotation();

    const startedAt = Date.now();

    const updateCountdownText = () => {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, delayMs - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      setLoaderText(
        `Retrying data load (${attempt}/${totalAttempts})...\nNext attempt in ${remainingSeconds}s`
      );

      // Retry waiting is intentionally indeterminate because no useful work is happening.
      setLoaderProgress(null);
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
    setProgress(dataReceivedProgress);
  }

  function startRendering({ text } = {}) {
    stopSimulatedProgress();

    if (shouldShowTechnicalLoadingStages() && text) {
      setLoaderText(text);
    }

    if (shouldRotateLoadingMessages()) {
      startLoaderTextRotation(getLoadingMessages(renderingMessagesStage, loadingTextMode), {
        intervalMs: loadingMessageIntervalMs,
        immediate: true,
      });
    }

    setProgress(renderStartProgress);
  }

  function handleRenderProgress({ progress, stage, layerTitle } = {}) {
    const normalizedProgress = clamp(progress ?? 0, 0, 1);
    const loaderProgress =
      renderStartProgress + normalizedProgress * (renderEndProgress - renderStartProgress);

    setProgress(loaderProgress);

    if (shouldShowTechnicalLoadingStages() && stage && layerTitle) {
      setLoaderText(`${stage} (${layerTitle})...`);
    }
  }

  function complete({ text = "Ready", hide = true } = {}) {
    cleanup();
    setLoaderText(text);
    setProgress(1);

    if (hide) {
      hideLoader();
    }
  }

  function fail({ text = "Failed to load data", label = "Failed", hideAfterMs = 1500 } = {}) {
    cleanup();
    setLoaderText(text);
    setLoaderProgress(1, {
      label,
    });

    if (hideAfterMs !== null) {
      window.setTimeout(() => hideLoader(), hideAfterMs);
    }
  }

  function cleanup() {
    stopRetryCountdown();
    stopSimulatedProgress();
    stopLoaderTextRotation();
  }

  function startSimulatedProgress() {
    stopSimulatedProgress();

    simulatedProgressIntervalId = window.setInterval(() => {
      simulatedProgress = Math.min(loadEndProgress, simulatedProgress + simulatedProgressStep);
      setProgress(simulatedProgress);

      if (simulatedProgress >= loadEndProgress) {
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
}

function setProgress(progress) {
  setLoaderProgress(progress, {
    label: `${Math.round(clamp(progress, 0, 1) * 100)}%`,
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
