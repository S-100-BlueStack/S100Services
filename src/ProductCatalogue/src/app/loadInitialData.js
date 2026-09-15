import { loadAppData } from "../features/data/services/dataLoader.js";
import { resetUnread } from "../features/notices/state/noticeStore.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { bindDataToMap } from "../features/map/services/bindDataToMap.js";
import { createLoaderProgressSession } from "../shared/ui/loaderProgressSession.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";
import { createInitialDataSourceProgress } from "./initialDataSourceProgress.js";
import { runInitialDataStartup } from "./initialDataStartup.js";

const abortController = new AbortController();

export async function loadInitialData(app) {
  const loaderProgress = createLoaderProgressSession({
    loadStartProgress: 0.03,
    loadEndProgress: 0.2,
    dataReceivedProgress: 0.22,
    renderStartProgress: 0.24,
    renderEndProgress: 0.52,
    simulatedProgressIntervalMs: 350,
    simulatedProgressStep: 0.012,
  });

  // Clear startup-era unread state before either independent pipeline can
  // publish notices. Source failures raised during compatibility retries then
  // remain visible instead of being cleared by a later AOI success.
  resetUnread();

  const sourceProgress = createInitialDataSourceProgress({
    controller: app.dataSourceController,
    onProgress: ({ progress, text }) => loaderProgress.updateProgressStage({ progress, text }),
  });

  const startupResult = await runInitialDataStartup({
    loadCompatibilityData: async () => {
      const result = await loadCompatibilityAoiData(app, loaderProgress);
      sourceProgress.begin();
      return result;
    },
    initializeRuntimeSources: () => app.dataSourceController?.initialize?.(),
  });
  sourceProgress.destroy();

  if (startupResult.runtimeSources.status === "rejected") {
    const error = normalizeError(startupResult.runtimeSources.reason);
    console.error("[Data sources] Initialization failed.", error);
    noticeError("Data sources could not be initialized", error.message);
    loaderProgress.fail({ text: "Failed to initialize data sources" });
  }

  if (startupResult.compatibility.status === "rejected") {
    const error = normalizeError(startupResult.compatibility.reason);
    loaderProgress.fail({
      text: "Failed to load data",
    });

    console.error("[Map debug] Data failed permanently:", error);
    noticeError("Data failed permanently", error.message);
  }

  if (
    startupResult.compatibility.status === "fulfilled" &&
    startupResult.runtimeSources.status === "fulfilled"
  ) {
    const failed = startupResult.runtimeSources.value?.failedSourceIds ?? [];
    loaderProgress.complete({
      text: failed.length ? "Some sources could not be loaded" : "Map ready",
    });
    app.bindMapVisibility?.();
    if (!failed.length) {
      app.updateLastUpdated();
      noticeSuccess(`Data loaded (${getTotalGraphicsFromMap(app.map)} graphics rendered)`, null, {
        countAsUnread: false,
      });
    }
  }
  return startupResult;
}

async function loadCompatibilityAoiData(app, loaderProgress) {
  loaderProgress.startLoading("Loading data...");
  const result = await runWithRetry(loadAppData, {
    maxRetries: 10,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    signal: abortController.signal,
    onRetry: ({ attempt, delay, error }) => {
      loaderProgress.startRetryCountdown({
        attempt,
        totalAttempts: 10,
        delayMs: delay,
      });

      noticeError(`Data load failed (${attempt}/10)`, error.message);
    },
  });

  const layers = normalizeLayers(result);
  loaderProgress.markDataReceived();

  await waitForNextPaint();

  loaderProgress.startRendering({
    text: `Rendering ${layers.length} data layer${layers.length === 1 ? "" : "s"}...`,
  });

  const renderSummary = await bindDataToMap({
    map: app.map,
    view: app.view,
    hoverManager: app.hoverManager,
    layers,
    onProgress: loaderProgress.handleRenderProgress,
  });

  return { renderSummary, totalGraphics: getTotalGraphicsFromRenderSummary(renderSummary) ?? 0 };
}

function normalizeLayers(result) {
  if (!result || !Array.isArray(result.layers)) {
    throw new Error("Data loader returned an invalid result. Expected { layers: [] }.");
  }

  const layers = result.layers.filter(Boolean);

  return layers;
}

function getTotalGraphicsFromRenderSummary(renderSummary) {
  if (!Array.isArray(renderSummary?.renderedLayers)) {
    return null;
  }

  return renderSummary.renderedLayers.reduce((sum, layer) => {
    return sum + (layer.graphicsCount ?? 0);
  }, 0);
}

function getTotalGraphicsFromMap(map) {
  const layers = map.layers?.toArray?.() ?? [];
  return layers.reduce((sum, layer) => {
    return sum + (layer.graphics?.length ?? 0);
  }, 0);
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error ?? "Unknown startup error."));
}
