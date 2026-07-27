import { initAnalyzePage } from "../features/analyze/core/initAnalyzePage.js";
import { createAnalyzeDocumentTitle } from "../features/analyze/routing/analyzeRoute.js";
import { initDashboardPage } from "../features/dashboard/core/initDashboardPage.js";
import { createDashboardDocumentTitle } from "../features/dashboard/routing/dashboardRoute.js";
import { initReviewPage } from "../features/review/core/initReviewPage.js";
import { createReviewDocumentTitle } from "../features/review/routing/reviewRoute.js";
import { noticeError } from "../features/notices/services/noticeService.js";
import { initializeProductJobTracking } from "../features/products/services/productJobService.js";
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

const REQUIRED_CALCITE_COMPONENTS = [
  "calcite-shell",
  "calcite-shell-panel",
  "calcite-panel",
];

async function waitForCalcite() {
  await waitForCalciteComponents(REQUIRED_CALCITE_COMPONENTS);
}

export async function bootstrap() {
  const route = getCurrentRoute();
  document.title = createInitialDocumentTitle(route);

  if (route.name === "dashboard") {
    await bootstrapDashboardRoute(route);
    return;
  }

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
    const ui = await initUI();
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

    initializeProductJobTracking({
      onRestoredTerminal: async () => {
        await app.refreshService.refresh({ source: "product-job" });
      },
    });

    app.bindMapVisibility?.();
    app.filterPanel?.refresh();
    app.refreshService.startAuto();
    ui.onboarding.setRouteReady();
  } catch (error) {
    hideLoader();
    noticeError("Application failed to start", error.message);
    console.error(error);
  }
}

async function bootstrapDashboardRoute(route) {
  try {
    const ui = await initUI();

    showLoader("Preparing Dashboard...", {
      progress: 0.01,
    });
    await waitForNextPaint();
    await waitForCalcite();

    const app = await initDashboardPage({
      rangePreset: route.rangePreset,
      from: route.from,
      to: route.to,
    });

    initializeProductJobTracking({
      onRestoredTerminal: async () => {
        await app.refresh();
      },
    });

    initializeTheme();
    registerThemeToggle();
    hideLoader();
    ui.onboarding.setRouteReady();
  } catch (error) {
    hideLoader();
    noticeError("Dashboard failed to start", error.message);
    console.error(error);
  }
}

async function bootstrapAnalyzeRoute(route) {
  try {
    const ui = await initUI();

    showLoader("Preparing UI components...", {
      progress: 0.01,
    });
    await waitForNextPaint();
    await waitForCalcite();

    const app = await initAnalyzePage({
      datasetNames: route.datasetNames,
    });

    initializeProductJobTracking({
      onRestoredTerminal: async () => {
        const currentRoute = getCurrentRoute();
        await app.loadAnalyzeDatasetNames(currentRoute.datasetNames, {
          updateUrl: false,
          showLoader: false,
        });
      },
    });

    initializeTheme(app.view);
    registerThemeToggle(app.view);
    hideLoader();
    ui.onboarding.setRouteReady();
  } catch (error) {
    hideLoader();
    noticeError("Analyze page failed to start", error.message);
    console.error(error);
  }
}

async function bootstrapReviewRoute(route) {
  try {
    const ui = await initUI();

    showLoader("Preparing Product Review...", {
      progress: 0.01,
    });
    await waitForNextPaint();
    await waitForCalcite();

    const app = await initReviewPage({
      datasetNames: route.datasetNames,
    });

    initializeProductJobTracking({
      onRestoredTerminal: async () => {
        const currentRoute = getCurrentRoute();
        await app.loadReviewDatasetNames(currentRoute.datasetNames, {
          updateUrl: false,
        });
      },
    });

    initializeTheme();
    registerThemeToggle();
    hideLoader();
    ui.onboarding.setRouteReady();
  } catch (error) {
    hideLoader();
    noticeError("Product Review failed to start", error.message);
    console.error(error);
  }
}

function createInitialDocumentTitle(route) {
  if (route.name === "dashboard") {
    return createDashboardDocumentTitle(route);
  }

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
