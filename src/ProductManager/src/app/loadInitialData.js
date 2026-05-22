import { loadAppData } from "../features/data/services/dataLoader.js";
import { resetUnread } from "../features/notices/state/noticeStore.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { bindDataToMap } from "../features/map/services/bindDataToMap.js";
import {
  hideLoader,
  setLoaderProgress,
  setLoaderText,
  startLoaderTextRotation,
  stopLoaderTextRotation,
} from "../shared/ui/loader.js";
import {
  getLoadingMessages,
  loadingMessageIntervalMs,
  loadingTextMode,
  shouldRotateLoadingMessages,
  shouldShowTechnicalLoadingStages,
} from "../shared/config/loadingTextConfig.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";

const abortController = new AbortController();

const DATA_LOAD_START_PROGRESS = 0.03;
const DATA_LOAD_END_PROGRESS = 0.16;
const DATA_RECEIVED_PROGRESS = 0.18;
const RENDER_START_PROGRESS = 0.2;
const RENDER_END_PROGRESS = 0.96;

const SIMULATED_DATA_PROGRESS_INTERVAL_MS = 350;
const SIMULATED_DATA_PROGRESS_STEP = 0.012;

let retryCountdownIntervalId = null;
let simulatedDataProgressIntervalId = null;
let simulatedDataProgress = DATA_LOAD_START_PROGRESS;

function clearRetryCountdown() {
  if (retryCountdownIntervalId !== null) {
    clearInterval(retryCountdownIntervalId);
    retryCountdownIntervalId = null;
  }
}

function startRetryCountdown(attempt, totalAttempts, delayMs) {
  clearRetryCountdown();
  stopSimulatedDataProgress();
  stopLoaderTextRotation();

  const startedAt = Date.now();

  const updateCountdownText = () => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, delayMs - elapsedMs);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    setLoaderText(
      `Retrying data load (${attempt}/${totalAttempts})... Next attempt in ${remainingSeconds}s`
    );

    // Retry waiting is intentionally indeterminate because no useful work is happening.
    setLoaderProgress(null);
  };

  updateCountdownText();

  retryCountdownIntervalId = window.setInterval(() => {
    updateCountdownText();

    if (Date.now() - startedAt >= delayMs) {
      clearRetryCountdown();
    }
  }, 1000);
}

export async function loadInitialData(app) {
  try {
    startDataLoadingUi();

    const result = await runWithRetry(loadAppData, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      signal: abortController.signal,
      onRetry: ({ attempt, delay, error }) => {
        startRetryCountdown(attempt, 5, delay);
        noticeError(`Data load failed (${attempt}/5)`, error.message);
      },
    });

    clearRetryCountdown();
    stopSimulatedDataProgress();

    const layers = normalizeLayers(result);

    setLoaderProgress(DATA_RECEIVED_PROGRESS, {
      label: `${Math.round(DATA_RECEIVED_PROGRESS * 100)}%`,
    });

    if (shouldShowTechnicalLoadingStages()) {
      setLoaderText(`Rendering ${layers.length} data layer${layers.length === 1 ? "" : "s"}...`);
    }

    await waitForNextPaint();

    if (shouldRotateLoadingMessages()) {
      startLoaderTextRotation(getLoadingMessages("renderingMap", loadingTextMode), {
        intervalMs: loadingMessageIntervalMs,
        immediate: true,
      });
    }

    const renderSummary = await bindDataToMap({
      map: app.map,
      view: app.view,
      hoverManager: app.hoverManager,
      layers,
      onProgress: handleRenderProgress,
    });

    stopLoaderTextRotation();

    setLoaderText("Map ready");
    setLoaderProgress(1, {
      label: "100%",
    });

    const totalGraphics =
      getUserFacingGraphicsFromRenderSummary(renderSummary) ??
      getUserFacingGraphicsFromMap(app.map);

    app.updateLastUpdated();

    hideLoader();

    if (totalGraphics === 0) {
      noticeError(
        "Data loaded but nothing was rendered",
        "The API returned layers, but no graphics were added to the map."
      );
    } else {
      noticeSuccess(`Data loaded (${totalGraphics} graphics rendered)`, null, {
        countAsUnread: false,
      });
    }

    resetUnread();
  } catch (error) {
    clearRetryCountdown();
    stopSimulatedDataProgress();
    stopLoaderTextRotation();

    console.error("[Map debug] Data failed permanently:", error);

    setLoaderText("Failed to load data");
    setLoaderProgress(1, {
      label: "Failed",
    });

    setTimeout(() => hideLoader(), 1500);
    noticeError("Data failed permanently", error.message);
  }
}

function startDataLoadingUi() {
  simulatedDataProgress = DATA_LOAD_START_PROGRESS;

  setLoaderText("Loading data...");
  setLoaderProgress(simulatedDataProgress, {
    label: `${Math.round(simulatedDataProgress * 100)}%`,
  });

  if (shouldRotateLoadingMessages()) {
    startLoaderTextRotation(getLoadingMessages("loadingData", loadingTextMode), {
      intervalMs: loadingMessageIntervalMs,
      immediate: false,
    });
  }

  startSimulatedDataProgress();
}

function startSimulatedDataProgress() {
  stopSimulatedDataProgress();

  simulatedDataProgressIntervalId = window.setInterval(() => {
    simulatedDataProgress = Math.min(
      DATA_LOAD_END_PROGRESS,
      simulatedDataProgress + SIMULATED_DATA_PROGRESS_STEP
    );

    setLoaderProgress(simulatedDataProgress, {
      label: `${Math.round(simulatedDataProgress * 100)}%`,
    });

    if (simulatedDataProgress >= DATA_LOAD_END_PROGRESS) {
      stopSimulatedDataProgress();
    }
  }, SIMULATED_DATA_PROGRESS_INTERVAL_MS);
}

function stopSimulatedDataProgress() {
  if (simulatedDataProgressIntervalId === null) {
    return;
  }

  window.clearInterval(simulatedDataProgressIntervalId);
  simulatedDataProgressIntervalId = null;
}

function handleRenderProgress({ progress, stage, layerTitle }) {
  const normalizedProgress = clamp(progress ?? 0, 0, 1);
  const loaderProgress =
    RENDER_START_PROGRESS + normalizedProgress * (RENDER_END_PROGRESS - RENDER_START_PROGRESS);

  setLoaderProgress(loaderProgress, {
    label: `${Math.round(loaderProgress * 100)}%`,
  });

  if (shouldShowTechnicalLoadingStages() && stage && layerTitle) {
    setLoaderText(`${stage} (${layerTitle})...`);
  }
}

function normalizeLayers(result) {
  if (!result || !Array.isArray(result.layers)) {
    throw new Error("Data loader returned an invalid result. Expected { layers: [] }.");
  }

  const layers = result.layers.filter(Boolean);

  if (layers.length === 0) {
    throw new Error("No layers were returned from the data loader.");
  }

  return layers;
}

function getUserFacingGraphicsFromRenderSummary(renderSummary) {
  if (!Array.isArray(renderSummary?.renderedLayers)) {
    return null;
  }

  return renderSummary.renderedLayers.reduce((sum, layer) => {
    if (!isUserFacingDataLayer(layer)) {
      return sum;
    }

    return sum + (layer.graphicsCount ?? 0);
  }, 0);
}

function getUserFacingGraphicsFromMap(map) {
  const layers = map.layers?.toArray?.() ?? [];

  return layers.reduce((sum, layer) => {
    if (!isUserFacingDataLayer(layer)) {
      return sum;
    }

    return sum + (layer.graphics?.length ?? 0);
  }, 0);
}

function isUserFacingDataLayer(layer) {
  const role = layer.role ?? layer.appLayerRole;

  // Overview graphics are duplicated representations of the same features.
  // They should not be included in user-facing loaded/rendered counts.
  return role !== "overview";
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
