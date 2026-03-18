import { noticeError } from "../features/notices/services/noticeService.js";
import { hideLoader, setLoaderText, showLoader } from "../shared/ui/loader.js";
import { initMap } from "./initMap.js";
import { initRefreshControls } from "./initRefreshControls.js";
import { initUI } from "./initUI.js";
import { loadInitialData } from "./loadInitialData.js";

async function waitForCalcite() {
  await customElements.whenDefined("calcite-loader");
}

export async function bootstrap() {
  try {
    await waitForCalcite();

    showLoader("Initializing application...");

    setLoaderText("Initializing UI...");
    await initUI();

    setLoaderText("Initializing map...");
    const app = initMap();

    initRefreshControls(app);

    await loadInitialData(app);

    app.refreshService.startAuto();
  } catch (error) {
    hideLoader();
    noticeError("Application failed to start", error.message);
    console.error(error);
  }
}
