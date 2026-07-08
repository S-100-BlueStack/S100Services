import { initAnalyzePage } from "../features/analyze/core/initAnalyzePage.js";
import { createAnalyzeDocumentTitle } from "../features/analyze/routing/analyzeRoute.js";
import { initReviewPage } from "../features/review/core/initReviewPage.js";
import { createReviewDocumentTitle } from "../features/review/routing/reviewRoute.js";
import { noticeError } from "../features/notices/services/noticeService.js";
import { hideLoader, setLoaderText, showLoader } from "../shared/ui/loader.js";
import { initMap } from "./initMap.js";
import { initRefreshControls } from "./initRefreshControls.js";
import { initUI } from "./initUI.js";
import { loadInitialData } from "./loadInitialData.js";
import { initializeTheme } from "../features/themes/themeService.js";
import { registerThemeToggle } from "../features/themes/themeToggle.js";
import { initDisplayScaleOverrideControl } from "../features/map/scale/displayScaleOverrideControl.js";
import { waitForCalciteComponents } from "../shared/ui/calciteComponentReady.js";
import { getCurrentRoute } from "./routing/appRoute.js";

const REQUIRED_CALCITE_COMPONENTS = ["calcite-shell", "calcite-shell-panel", "calcite-panel"];

async function waitForCalcite() {
  await waitForCalciteComponents(REQUIRED_CALCITE_COMPONENTS);
}

export async function bootstrap() {
  const route = getCurrentRoute();

  document.title = createInitialDocumentTitle(route);

  if (route.name === "analyze") {
    await bootstrapAnalyzeRoute(route);
    return;
  }

  if (route.name === "review") {
    await bootstrapReviewRoute(route);
    return;
  }

  await bootstrapMainRoute();
}

async function bootstrapMainRoute() {
  document.title = "Product Manager";

  try {
    await initUI();
    initDisplayScaleOverrideControl();

    const app = initMap();

    initRefreshControls(app);
    initializeTheme(app.view);
    registerThemeToggle(app.view);

    showLoader("Preparing UI components...", {
      progress: 0.01,
    });

    await waitForNextPaint();
    await waitForCalcite();

    setLoaderText("Loading data...");

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
    await initUI();

    showLoader("Preparing UI components...", {
      progress: 0.01,
    });

    await waitForNextPaint();
    await waitForCalcite();

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

async function bootstrapReviewRoute(route) {
  try {
    await initUI();

    showLoader("Preparing Product Review...", {
      progress: 0.01,
    });

    await waitForNextPaint();
    await waitForCalcite();

    await initReviewPage({
      datasetNames: route.datasetNames,
    });

    initializeTheme();
    registerThemeToggle();
    hideLoader();
  } catch (error) {
    hideLoader();
    noticeError("Product Review failed to start", error.message);
    console.error(error);
  }
}

function createInitialDocumentTitle(route) {
  if (route.name === "analyze") {
    return createAnalyzeDocumentTitle(route.datasetNames);
  }

  if (route.name === "review") {
    return createReviewDocumentTitle(route.datasetNames);
  }

  return "Product Manager";
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
