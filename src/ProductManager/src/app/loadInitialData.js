import { loadAppData } from "../features/data/services/dataLoader.js";
import { resetUnread } from "../features/notices/state/noticeStore.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { bindDataToMap } from "../features/map/services/bindDataToMap.js";
import { hideLoader, setLoaderText } from "../shared/ui/loader.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";

const abortController = new AbortController();

let retryCountdownIntervalId = null;

function clearRetryCountdown() {
  if (retryCountdownIntervalId !== null) {
    clearInterval(retryCountdownIntervalId);
    retryCountdownIntervalId = null;
  }
}

function startRetryCountdown(attempt, totalAttempts, delayMs) {
  clearRetryCountdown();

  const startedAt = Date.now();

  const updateCountdownText = () => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, delayMs - elapsedMs);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    setLoaderText(
      `Retrying data load (${attempt}/${totalAttempts})... Next attempt in ${remainingSeconds}s`
    );
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
    setLoaderText("Loading data...");

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

    const layers = normalizeLayers(result);

    setLoaderText(`Rendering ${layers.length} layer${layers.length === 1 ? "" : "s"}...`);

    await bindDataToMap({
      map: app.map,
      view: app.view,
      hoverManager: app.hoverManager,
      layers,
    });

    app.updateLastUpdated();

    hideLoader();
    noticeSuccess("Data loaded", null, { countAsUnread: false });
    resetUnread();
  } catch (error) {
    clearRetryCountdown();

    setLoaderText("Failed to load data");
    setTimeout(() => hideLoader(), 1500);
    noticeError("Data failed permanently", error.message);
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
