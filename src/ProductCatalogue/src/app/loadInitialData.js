import { loadAppData } from "../features/data/services/dataLoader.js";
import { resetUnread } from "../features/notices/state/noticeStore.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { bindDataToMap } from "../features/map/services/bindDataToMap.js";
import { createLoaderProgressSession } from "../shared/ui/loaderProgressSession.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";
import { runInitialDataStartup } from "./initialDataStartup.js";

const abortController = new AbortController();

export async function loadInitialData(app) {
  const loaderProgress = createLoaderProgressSession({
    loadStartProgress: 0.03,
    loadEndProgress: 0.52,
    dataReceivedProgress: 0.54,
    renderStartProgress: 0.56,
    renderEndProgress: 0.96,
    simulatedProgressIntervalMs: 350,
    simulatedProgressStep: 0.012,
  });

  // Clear startup-era unread state before either independent pipeline can
  // publish notices. Source failures raised during compatibility retries then
  // remain visible instead of being cleared by a later AOI success.
  resetUnread();

  const startupResult = await runInitialDataStartup({
    loadCompatibilityData: () => loadCompatibilityAoiData(app, loaderProgress),
    initializeRuntimeSources: () => app.dataSourceController?.initialize?.(),
  });

  if (startupResult.runtimeSources.status === "rejected") {
    const error = normalizeError(startupResult.runtimeSources.reason);
    console.error("[Data sources] Initialization failed.", error);
    noticeError("Data sources could not be initialized", error.message);
  }

  if (startupResult.compatibility.status === "rejected") {
    const error = normalizeError(startupResult.compatibility.reason);
    loaderProgress.fail({
      text: "Failed to load data",
    });

    console.error("[Map debug] Data failed permanently:", error);
    noticeError("Data failed permanently", error.message);
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

  loaderProgress.complete({
    text: "Map ready",
  });

  app.updateLastUpdated();

  // Prefer the compatibility render summary so concurrently committed FI-011
  // source layers cannot affect AOI success/empty-result notices.
  const totalGraphics =
    getTotalGraphicsFromRenderSummary(renderSummary) ?? getTotalGraphicsFromMap(app.map);

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

  return {
    renderSummary,
    totalGraphics,
  };
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
