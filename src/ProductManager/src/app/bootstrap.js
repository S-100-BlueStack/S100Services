import { initAnalyzePage } from "../features/analyze/core/initAnalyzePage.js";
import {
  createAnalyzeDocumentTitle,
  getCurrentRoute,
} from "../features/analyze/routing/analyzeRoute.js";
import { noticeError } from "../features/notices/services/noticeService.js";
import { hideLoader, setLoaderText, showLoader } from "../shared/ui/loader.js";
import { initMap } from "./initMap.js";
import { initRefreshControls } from "./initRefreshControls.js";
import { initUI } from "./initUI.js";
import { loadInitialData } from "./loadInitialData.js";
import { initializeTheme } from "../features/themes/themeService.js";
import { registerThemeToggle } from "../features/themes/themeToggle.js";
import { initDisplayScaleOverrideControl } from "../features/map/scale/displayScaleOverrideControl.js";

async function waitForCalcite() {
  await customElements.whenDefined("calcite-loader");
}

export async function bootstrap() {
  const route = getCurrentRoute();

  document.title =
    route.name === "analyze" ? createAnalyzeDocumentTitle(route.datasetNames) : "Product Manager";

  if (route.name === "analyze") {
    await bootstrapAnalyzeRoute(route);
    return;
  }

  await bootstrapMainRoute();
}

async function bootstrapMainRoute() {
  document.title = "Product Manager";

  try {
    await waitForCalcite();

    showLoader("Initializing application...");
    setLoaderText("Initializing UI...");
    await initUI();
    initDisplayScaleOverrideControl();

    setLoaderText("Initializing map...");
    const app = initMap();

    initRefreshControls(app);
    initializeTheme(app.view);
    registerThemeToggle(app.view);

    await loadInitialData(app);

    app.bindMapVisibility?.();
    app.filterPanel?.refresh();
    app.refreshService.startAuto();
  } catch (error) {
    hideLoader();
    noticeError("Application failed to start", error.message);
    console.error(error);
  }
}

async function bootstrapAnalyzeRoute(route) {
  try {
    await waitForCalcite();

    showLoader("Initializing analyze page...");
    setLoaderText("Initializing UI...");
    await initUI();

    setLoaderText("Loading analyze data...");
    const app = await initAnalyzePage({
      datasetNames: route.datasetNames,
    });

    initializeTheme(app.view);
    registerThemeToggle(app.view);

    hideLoader();
  } catch (error) {
    hideLoader();
    noticeError("Analyze page failed to start", error.message);
    console.error(error);
  }
}
