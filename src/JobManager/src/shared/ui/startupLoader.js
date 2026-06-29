const SIMULATED_PROGRESS_INTERVAL_MS = 350;
const SIMULATED_PROGRESS_STEP = 0.012;
const COMPLETE_HIDE_DELAY_MS = 180;

export function createStartupLoader() {
  const element = document.createElement("section");
  element.className = "job-manager-startup-loader";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-label", "Job Manager startup status");

  const cardElement = document.createElement("div");
  cardElement.className = "job-manager-startup-loader__card";

  const titleElement = document.createElement("h1");
  titleElement.className = "job-manager-startup-loader__title";
  titleElement.textContent = "Job Manager";

  const textElement = document.createElement("p");
  textElement.className = "job-manager-startup-loader__text";
  textElement.textContent = "Starting Job Manager...";

  const detailElement = document.createElement("p");
  detailElement.className = "job-manager-startup-loader__detail";
  detailElement.textContent = "";

  const progressElement = document.createElement("div");
  progressElement.className = "job-manager-startup-loader__progress";
  progressElement.setAttribute("role", "progressbar");
  progressElement.setAttribute("aria-valuemin", "0");
  progressElement.setAttribute("aria-valuemax", "100");

  const progressFillElement = document.createElement("div");
  progressFillElement.className = "job-manager-startup-loader__progress-fill";

  const progressLabelElement = document.createElement("p");
  progressLabelElement.className = "job-manager-startup-loader__progress-label";
  progressLabelElement.textContent = "";

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "job-manager-startup-loader__action";
  actionButton.textContent = "Retry now";
  actionButton.hidden = true;

  progressElement.append(progressFillElement);
  cardElement.append(
    titleElement,
    textElement,
    detailElement,
    progressElement,
    progressLabelElement,
    actionButton
  );
  element.append(cardElement);

  let retryCountdownIntervalId = null;
  let simulatedProgressIntervalId = null;
  let hideTimeoutId = null;
  let currentProgress = 0;
  let retryHandler = null;

  actionButton.addEventListener("click", () => {
    retryHandler?.();
  });

  function startLoading(text = "Starting Job Manager...") {
    cleanupTimers();
    retryHandler = null;
    actionButton.hidden = true;
    element.hidden = false;
    element.dataset.state = "loading";
    setText(text);
    setDetail("");
    setProgress(0.04);
    startSimulatedProgress({
      endProgress: 0.32,
    });
  }

  function startRetryCountdown({ attempt, totalAttempts, delayMs, error, label = "startup" } = {}) {
    cleanupTimers();
    actionButton.hidden = true;
    element.hidden = false;
    element.dataset.state = "retrying";
    setProgress(null);

    const startedAt = Date.now();

    function updateCountdownText() {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, delayMs - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const errorMessage = error?.message ? ` - ${error.message}` : "";

      setText(`Retrying ${label} (${attempt}/${totalAttempts})...`);
      setDetail(`Next attempt in ${remainingSeconds}s${errorMessage}`);
    }

    updateCountdownText();

    retryCountdownIntervalId = window.setInterval(() => {
      updateCountdownText();

      if (Date.now() - startedAt >= delayMs) {
        stopRetryCountdown();
      }
    }, 1000);
  }

  function markDataReceived({ text = "Required data loaded.", progress = 0.42 } = {}) {
    stopRetryCountdown();
    stopSimulatedProgress();
    setText(text);
    setDetail("");
    setProgress(progress);
  }

  function startRendering({ text = "Preparing map workspace...", progress = 0.58 } = {}) {
    stopRetryCountdown();
    stopSimulatedProgress();
    setText(text);
    setDetail("");
    setProgress(progress);
    startSimulatedProgress({
      endProgress: 0.92,
    });
  }

  function complete({ text = "Job Manager ready." } = {}) {
    cleanupTimers();
    element.dataset.state = "complete";
    setText(text);
    setDetail("");
    setProgress(1);

    hideTimeoutId = window.setTimeout(() => {
      element.hidden = true;
    }, COMPLETE_HIDE_DELAY_MS);
  }

  function fail({ text = "Job Manager could not be loaded.", message = "", onRetry } = {}) {
    cleanupTimers();
    element.hidden = false;
    element.dataset.state = "failed";
    setText(text);
    setDetail(message);
    setProgress(1, {
      label: "Failed",
    });

    retryHandler = onRetry;
    actionButton.hidden = typeof onRetry !== "function";
  }

  function setText(text) {
    textElement.textContent = text;
  }

  function setDetail(text) {
    detailElement.textContent = text || "";
    detailElement.hidden = !text;
  }

  function setProgress(progress, { label = null } = {}) {
    if (progress === null || progress === undefined) {
      currentProgress = null;
      progressElement.classList.add("is-indeterminate");
      progressElement.removeAttribute("aria-valuenow");
      progressFillElement.style.width = "45%";
      progressLabelElement.textContent = label ?? "";
      return;
    }

    currentProgress = clamp(progress, 0, 1);

    const percentage = Math.round(currentProgress * 100);

    progressElement.classList.remove("is-indeterminate");
    progressElement.setAttribute("aria-valuenow", String(percentage));
    progressFillElement.style.width = `${percentage}%`;
    progressLabelElement.textContent = label ?? `${percentage}%`;
  }

  function destroy() {
    cleanupTimers();
    element.remove();
  }

  function cleanupTimers() {
    stopRetryCountdown();
    stopSimulatedProgress();

    if (hideTimeoutId !== null) {
      window.clearTimeout(hideTimeoutId);
      hideTimeoutId = null;
    }
  }

  function stopRetryCountdown() {
    if (retryCountdownIntervalId === null) {
      return;
    }

    window.clearInterval(retryCountdownIntervalId);
    retryCountdownIntervalId = null;
  }

  function startSimulatedProgress({ endProgress }) {
    stopSimulatedProgress();

    simulatedProgressIntervalId = window.setInterval(() => {
      const progressBase = typeof currentProgress === "number" ? currentProgress : 0;
      setProgress(Math.min(endProgress, progressBase + SIMULATED_PROGRESS_STEP));

      if (currentProgress >= endProgress) {
        stopSimulatedProgress();
      }
    }, SIMULATED_PROGRESS_INTERVAL_MS);
  }

  function stopSimulatedProgress() {
    if (simulatedProgressIntervalId === null) {
      return;
    }

    window.clearInterval(simulatedProgressIntervalId);
    simulatedProgressIntervalId = null;
  }

  return {
    element,
    startLoading,
    startRetryCountdown,
    markDataReceived,
    startRendering,
    setText,
    setDetail,
    setProgress,
    complete,
    fail,
    destroy,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
