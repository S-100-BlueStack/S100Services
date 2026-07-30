let loaderElement;
let loaderTextElement;
let loaderContentElement;
let progressElement;
let progressFillElement;
let progressLabelElement;
let textRotationIntervalId = null;
let isInitialized = false;
let loaderVisibilityRevision = 0;

function initLoader() {
  if (isInitialized) return;

  loaderElement = document.getElementById("app-loader");
  loaderTextElement = document.getElementById("loader-text");
  loaderContentElement = loaderElement?.querySelector?.(".loader-content") ?? loaderElement;

  removeLegacySpinner();
  ensureProgressElements();

  isInitialized = true;
}

export function showLoader(text = "Loading...", { progress = null } = {}) {
  initLoader();

  if (!loaderElement) return;

  const visibilityRevision = ++loaderVisibilityRevision;

  setLoaderText(text);
  setLoaderProgress(progress);

  requestAnimationFrame(() => {
    if (visibilityRevision !== loaderVisibilityRevision) {
      return;
    }

    loaderElement.classList.remove("hidden");
  });
}
export function hideLoader() {
  initLoader();

  if (!loaderElement) return;

  loaderVisibilityRevision += 1;
  stopLoaderTextRotation();
  loaderElement.classList.add("hidden");
}

export function setLoaderText(text) {
  initLoader();

  if (!loaderTextElement) return;

  loaderTextElement.textContent = text;
  loaderTextElement.style.visibility = "visible";
}

export function setLoaderProgress(progress, { label = null } = {}) {
  initLoader();

  if (!progressElement || !progressFillElement) {
    return;
  }

  if (progress === null || progress === undefined) {
    progressElement.classList.add("is-indeterminate");
    progressElement.removeAttribute("aria-valuenow");
    progressFillElement.style.width = "45%";
    setProgressLabel(label);
    return;
  }

  const normalizedProgress = clamp(progress, 0, 1);
  const percent = Math.round(normalizedProgress * 100);

  progressElement.classList.remove("is-indeterminate");
  progressElement.setAttribute("aria-valuenow", String(percent));
  progressFillElement.style.width = `${percent}%`;

  setProgressLabel(label ?? `${percent}%`);
}

export function startLoaderTextRotation(messages, { intervalMs = 1800, immediate = true } = {}) {
  initLoader();
  stopLoaderTextRotation();

  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  let messageIndex = Math.floor(Math.random() * messages.length);

  if (immediate) {
    setLoaderText(messages[messageIndex]);
  }

  textRotationIntervalId = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % messages.length;
    setLoaderText(messages[messageIndex]);
  }, intervalMs);
}

export function stopLoaderTextRotation() {
  if (textRotationIntervalId === null) {
    return;
  }

  window.clearInterval(textRotationIntervalId);
  textRotationIntervalId = null;
}

function removeLegacySpinner() {
  const legacySpinner = loaderContentElement?.querySelector?.("calcite-loader");

  if (legacySpinner) {
    legacySpinner.remove();
  }
}

function ensureProgressElements() {
  if (!loaderContentElement) {
    return;
  }

  progressElement = document.getElementById("loader-progress");

  if (!progressElement) {
    progressElement = document.createElement("div");
    progressElement.id = "loader-progress";
    progressElement.className = "loader-progress is-indeterminate";
    progressElement.setAttribute("role", "progressbar");
    progressElement.setAttribute("aria-valuemin", "0");
    progressElement.setAttribute("aria-valuemax", "100");

    progressFillElement = document.createElement("div");
    progressFillElement.className = "loader-progress__fill";

    progressElement.appendChild(progressFillElement);
    loaderContentElement.appendChild(progressElement);
  } else {
    progressFillElement = progressElement.querySelector(".loader-progress__fill");

    if (!progressFillElement) {
      progressFillElement = document.createElement("div");
      progressFillElement.className = "loader-progress__fill";
      progressElement.appendChild(progressFillElement);
    }
  }

  progressLabelElement = document.getElementById("loader-progress-label");

  if (!progressLabelElement) {
    progressLabelElement = document.createElement("div");
    progressLabelElement.id = "loader-progress-label";
    progressLabelElement.className = "loader-progress__label";
    loaderContentElement.appendChild(progressLabelElement);
  }
}

function setProgressLabel(label) {
  if (!progressLabelElement) {
    return;
  }

  progressLabelElement.textContent = label ?? "";
  progressLabelElement.style.visibility = label ? "visible" : "hidden";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
