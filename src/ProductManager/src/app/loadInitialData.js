import { loadAppData } from "../features/data/services/dataLoader.js";
import { resetUnread } from "../features/notices/state/noticeStore.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { bindDataToMap } from "../features/map/services/bindDataToMap.js";
import { hideLoader, setLoaderText } from "../shared/ui/loader.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";

const abortController = new AbortController();

export async function loadInitialData(app) {
  try {
    setLoaderText("Loading data...");

    const data = await runWithRetry(loadAppData, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      signal: abortController.signal,
      onRetry: ({ attempt, delay, error }) => {
        setLoaderText(`Retrying data load (${attempt}/5)... Next attempt in ${delay / 1000}s`);
        noticeError(`Data load failed (${attempt}/5)`, error.message);
      },
    });

    setLoaderText("Rendering data...");

    await bindDataToMap({
      map: app.map,
      view: app.view,
      hoverManager: app.hoverManager,
      layers: data.layers,
    });

    app.updateLastUpdated();

    hideLoader();
    noticeSuccess("Data loaded", null, { countAsUnread: false });
    resetUnread();
  } catch (error) {
    setLoaderText("Failed to load data");
    setTimeout(() => hideLoader(), 1500);
    noticeError("Data failed permanently", error.message);
  }
}
