import { loadStatuses } from "../../data/stores/statusStore.js";
import { createMap } from "../../map/core/createMap.js";
import { createView } from "../../map/core/createView.js";
import { noticeError, noticeWarning } from "../../notices/services/noticeService.js";
import { fetchAnalyzeProducts } from "../api/analyzeApi.js";
import { createAnalyzeLayers } from "../map/createAnalyzeLayers.js";
import { zoomToGraphicsExtent } from "../map/zoomToGraphics.js";
import {
  createAnalyzeDocumentTitle,
  getCurrentRoute,
  setAnalyzeRouteUrl,
} from "../routing/analyzeRoute.js";
import { renderAnalyzeSidebar } from "../ui/analyzeSidebar.js";
import { createLoaderProgressSession } from "../../../shared/ui/loaderProgressSession.js";
import { hideLoader } from "../../../shared/ui/loader.js";

export async function initAnalyzePage({ datasetNames }) {
  let currentLayers = [];
  let currentProducts = [];
  let loadRequestId = 0;
  let lookupsLoaded = false;
  let activeLoaderProgress = null;

  const normalizedDatasetNames = normalizeDatasetNames(datasetNames);

  document.body.classList.add("pm-analyze-route");
  document.title = createAnalyzeDocumentTitle(normalizedDatasetNames);

  const map = createMap();
  const view = createView(map);

  const loadAnalyzeDatasetNames = async (nextDatasetNames, { updateUrl = true } = {}) => {
    const requestId = ++loadRequestId;
    const normalizedNextDatasetNames = normalizeDatasetNames(nextDatasetNames);

    activeLoaderProgress?.cleanup();
    activeLoaderProgress = null;

    if (updateUrl) {
      setAnalyzeRouteUrl(normalizedNextDatasetNames);
    }

    document.title = createAnalyzeDocumentTitle(normalizedNextDatasetNames);

    renderAnalyzeSidebar({
      datasetNames: normalizedNextDatasetNames,
      products: currentProducts,
      loading: normalizedNextDatasetNames.length > 0,
    });

    removeLayers(map, currentLayers);
    currentLayers = [];
    currentProducts = [];

    if (normalizedNextDatasetNames.length === 0) {
      renderAnalyzeSidebar({
        datasetNames: [],
        products: [],
        loading: false,
      });
      return;
    }

    const loaderProgress = createAnalyzeLoaderProgress();
    activeLoaderProgress = loaderProgress;

    try {
      loaderProgress.startLoading("Loading analyze data...", {
        rotateImmediately: true,
      });

      await ensureLookupsLoaded();

      const products = await fetchAnalyzeProducts(normalizedNextDatasetNames);

      if (requestId !== loadRequestId) {
        return;
      }

      loaderProgress.markDataReceived();
      loaderProgress.startRendering({
        text: `Rendering ${products.length} analyze product${products.length === 1 ? "" : "s"}...`,
      });

      const layers = await createAnalyzeLayers(map, products, {
        onProgress: loaderProgress.handleRenderProgress,
      });

      if (requestId !== loadRequestId) {
        return;
      }

      currentProducts = products;
      currentLayers = layers;

      renderAnalyzeSidebar({
        datasetNames: normalizedNextDatasetNames,
        products,
        loading: false,
      });

      showMockWarningIfNeeded(products);

      await waitForLayerViews(view, layers);

      if (requestId !== loadRequestId) {
        return;
      }

      const didZoom = await zoomToGraphicsExtent(view, layers);

      if (!didZoom) {
        noticeError(
          "Analyze geometry not found",
          "The product was loaded, but no AOI geometry could be rendered on the map."
        );
      }

      loaderProgress.complete({
        text: "Analyze ready",
      });
    } catch (error) {
      if (requestId === loadRequestId) {
        loaderProgress.fail({
          text: "Failed to load analyze data",
        });

        noticeError(
          "Analyze data failed",
          error instanceof Error ? error.message : "Unknown analyze error"
        );
      }
    } finally {
      if (activeLoaderProgress === loaderProgress) {
        activeLoaderProgress = null;
      }
    }
  };

  document.addEventListener("pm-analyze-dataset-submit", async (event) => {
    await loadAnalyzeDatasetNames(event.detail?.datasetNames ?? [], {
      updateUrl: true,
    });
  });

  applyAnalyzeViewPadding(view);

  await view.when();

  // The bootstrap loader covers initial page and map setup. Hide it before
  // data loading starts so the delayed Analyze loader can decide whether a
  // loader is needed at all.
  hideLoader();

  renderAnalyzeSidebar({
    datasetNames: normalizedDatasetNames,
    products: [],
    loading: false,
  });

  await loadAnalyzeDatasetNames(normalizedDatasetNames, {
    updateUrl: false,
  });

  window.addEventListener("popstate", async () => {
    const route = getCurrentRoute();

    await loadAnalyzeDatasetNames(route.datasetNames, {
      updateUrl: false,
    });
  });

  return {
    map,
    view,
    get products() {
      return currentProducts;
    },
    get layers() {
      return currentLayers;
    },
    loadAnalyzeDatasetNames,
  };

  async function ensureLookupsLoaded() {
    if (lookupsLoaded) {
      return;
    }

    await loadLookupsSafely();
    lookupsLoaded = true;
  }
}

function createAnalyzeLoaderProgress() {
  return createLoaderProgressSession({
    loadStartProgress: 0.04,
    loadEndProgress: 0.2,
    dataReceivedProgress: 0.22,
    renderStartProgress: 0.24,
    renderEndProgress: 0.96,
    simulatedProgressIntervalMs: 350,
    simulatedProgressStep: 0.014,
    showLoaderOnStart: true,
    showLoaderDelayMs: 350,
  });
}

function normalizeDatasetNames(datasetNames) {
  return (Array.isArray(datasetNames) ? datasetNames : [datasetNames])
    .map((datasetName) => String(datasetName ?? "").trim())
    .filter(Boolean);
}

async function loadLookupsSafely() {
  const results = await Promise.allSettled([loadStatuses()]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[Analyze] Lookup data failed to load", result.reason);
    }
  }
}

async function waitForLayerViews(view, layers) {
  await Promise.all(
    layers.map(async (layer) => {
      try {
        await view.whenLayerView(layer);
      } catch (error) {
        console.warn("[Analyze] Failed to create layer view", {
          layerId: layer.id,
          error,
        });
      }
    })
  );
}

function removeLayers(map, layers) {
  for (const layer of layers) {
    map.remove(layer);
  }
}

function applyAnalyzeViewPadding(view) {
  const updatePadding = () => {
    const panel = document.getElementById("analyze-sidebar-panel");
    const panelWidth = panel?.getBoundingClientRect?.().width ?? 420;
    const isNarrowScreen = window.matchMedia("(max-width: 700px)").matches;

    view.padding = {
      left: isNarrowScreen ? 0 : Math.min(panelWidth + 24, window.innerWidth * 0.45),
      right: 24,
      top: 24,
      bottom: isNarrowScreen ? 320 : 24,
    };
  };

  updatePadding();
  requestAnimationFrame(updatePadding);
  window.addEventListener("resize", updatePadding);
}

function showMockWarningIfNeeded(products) {
  const mockProducts = products.filter((product) => product.isMock);

  if (mockProducts.length === 0) {
    return;
  }

  noticeWarning(
    "Using mock analyze data",
    `Backend data was not available for ${mockProducts
      .map((product) => product.datasetName)
      .join(", ")}.`
  );
}
