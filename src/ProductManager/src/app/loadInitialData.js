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

    debugLoadedLayers(layers);

    setLoaderText(`Rendering ${layers.length} layer${layers.length === 1 ? "" : "s"}...`);

    const renderSummary = await bindDataToMap({
      map: app.map,
      view: app.view,
      hoverManager: app.hoverManager,
      layers,
    });

    await debugMapState(app, renderSummary);

    const totalGraphics =
      getTotalGraphicsFromRenderSummary(renderSummary) ?? getTotalGraphicsFromMap(app.map);

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

    console.error("[Map debug] Data failed permanently:", error);

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

function debugLoadedLayers(layers) {
  console.groupCollapsed("[Map debug] Loaded data layers");

  console.table(
    layers.map((layer, index) => ({
      index,
      id: layer.id ?? layer.name ?? layer.title ?? "(unknown)",
      title: layer.title ?? null,
      featureCount: getFeatureCount(layer),
      hasFeaturesArray: Array.isArray(layer.features),
      hasGeoJsonFeatures: Array.isArray(layer.geoJson?.features),
      hasDataFeatures: Array.isArray(layer.data?.features),
      geometryType: getFirstGeometryType(layer),
      firstCoordinates: getFirstCoordinates(layer),
    }))
  );

  console.log("Raw loaded layers:", layers);
  console.groupEnd();
}

async function debugMapState(app, renderSummary) {
  const mapLayers = app.map.layers?.toArray?.() ?? [];

  console.groupCollapsed("[Map debug] Map state after bindDataToMap");

  console.log("Render summary from bindDataToMap:", renderSummary);

  console.table(
    mapLayers.map((layer, index) => ({
      index,
      id: layer.id,
      title: layer.title,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      graphicsCount: layer.graphics?.length ?? null,
      hasRenderer: Boolean(layer.renderer),
      minScale: layer.minScale,
      maxScale: layer.maxScale,
    }))
  );

  console.table({
    mapLayerCount: mapLayers.length,
    totalGraphicsInMap: getTotalGraphicsFromMap(app.map),
    viewReady: app.view.ready,
    viewUpdating: app.view.updating,
    viewScale: app.view.scale,
    center: JSON.stringify(app.view.center?.toJSON?.() ?? null),
    extent: JSON.stringify(app.view.extent?.toJSON?.() ?? null),
  });

  logFirstGraphics(mapLayers);

  await debugLayerViews(app.view, mapLayers);

  console.groupEnd();
}

async function debugLayerViews(view, layers) {
  const results = await Promise.all(
    layers.map(async (layer) => {
      try {
        const layerView = await view.whenLayerView(layer);

        return {
          id: layer.id,
          title: layer.title,
          type: layer.type,
          layerViewCreated: true,
          suspended: layerView.suspended,
          updating: layerView.updating,
        };
      } catch (error) {
        return {
          id: layer.id,
          title: layer.title,
          type: layer.type,
          layerViewCreated: false,
          error: error.message,
        };
      }
    })
  );

  console.table(results);
}

function logFirstGraphics(layers) {
  for (const layer of layers) {
    const firstGraphic = layer.graphics?.at?.(0);

    if (!firstGraphic) {
      continue;
    }

    console.groupCollapsed(`[Map debug] First graphic in layer: ${layer.title ?? layer.id}`);

    console.log("Geometry:", firstGraphic.geometry?.toJSON?.() ?? firstGraphic.geometry);
    console.log("Symbol:", firstGraphic.symbol);
    console.log("Attributes:", firstGraphic.attributes);
    console.log("Popup template:", firstGraphic.popupTemplate);

    console.groupEnd();
  }
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

function getFeatureCount(layer) {
  if (Array.isArray(layer.features)) {
    return layer.features.length;
  }

  if (Array.isArray(layer.geoJson?.features)) {
    return layer.geoJson.features.length;
  }

  if (Array.isArray(layer.data?.features)) {
    return layer.data.features.length;
  }

  return null;
}

function getFeatures(layer) {
  if (Array.isArray(layer.features)) {
    return layer.features;
  }

  if (Array.isArray(layer.geoJson?.features)) {
    return layer.geoJson.features;
  }

  if (Array.isArray(layer.data?.features)) {
    return layer.data.features;
  }

  return [];
}

function getFirstGeometryType(layer) {
  return getFeatures(layer)[0]?.geometry?.type ?? null;
}

function getFirstCoordinates(layer) {
  const coordinates = getFeatures(layer)[0]?.geometry?.coordinates;

  if (!coordinates) {
    return null;
  }

  return JSON.stringify(coordinates).slice(0, 200);
}
