import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createLayerIndexAsync } from "../core/layerIndex.js";
import { createPopup } from "../popups/createPopup.js";
import { resolveScaleRanges } from "../config/scaleRanges.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { esriJsonToGraphics } from "../transformers/esriJsonToGraphics.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";

const DEFAULT_GRAPHICS_CHUNK_SIZE = 50;

export async function createGraphicsLayer(map, layerConfig, { onProgress } = {}) {
  const {
    id,
    title = id,
    dataFormat = "geojson",
    data,
    displayScale,
    graphicsChunkSize = DEFAULT_GRAPHICS_CHUNK_SIZE,
  } = layerConfig;

  const popupTemplate = createPopup();
  const scaleRanges = resolveScaleRanges(layerConfig);

  reportProgress(onProgress, 0, "Preparing layer", title);

  const detailGraphics = await createGraphicsFromData(data, {
    dataFormat,
    layerId: id,
    displayScale,
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0, 0.42), "Creating graphics", title);
    },
  });

  const overviewGraphics = await mapGraphicsInChunks(detailGraphics, createOverviewGraphic, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.42, 0.56), "Creating overview", title);
    },
  });

  const overviewLayer = new GraphicsLayer({
    title: `${id} overview`,
    minScale: scaleRanges.overview.minScale,
    maxScale: scaleRanges.overview.maxScale,
    popupTemplate,
  });

  const detailLayer = new GraphicsLayer({
    title: id,
    minScale: scaleRanges.detail.minScale,
    maxScale: scaleRanges.detail.maxScale,
    popupTemplate,
  });

  const overviewIndex = await createLayerIndexAsync(overviewGraphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.56, 0.62), "Indexing overview", title);
    },
  });

  const detailIndex = await createLayerIndexAsync(detailGraphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.62, 0.68), "Indexing graphics", title);
    },
  });

  applyAppLayerMetadata(overviewLayer, {
    customId: `${id}:overview`,
    appLayerId: id,
    role: "overview",
    index: overviewIndex,
  });

  applyAppLayerMetadata(detailLayer, {
    customId: `${id}:detail`,
    appLayerId: id,
    role: "detail",
    index: detailIndex,
  });

  map.add(overviewLayer);
  map.add(detailLayer);

  await addGraphicsInChunks(overviewLayer, overviewGraphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.68, 0.82), "Adding overview", title);
    },
  });

  await addGraphicsInChunks(detailLayer, detailGraphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.82, 1), "Adding graphics", title);
    },
  });

  reportProgress(onProgress, 1, "Layer ready", title);

  return [overviewLayer, detailLayer];
}

async function createGraphicsFromData(
  data,
  { dataFormat, layerId, displayScale, chunkSize, onProgress }
) {
  const source = createFeatureChunkSource(data, dataFormat);
  const graphics = [];
  const totalFeatures = source.features.length;

  if (totalFeatures === 0) {
    onProgress?.(1);
    return graphics;
  }

  for (let start = 0; start < totalFeatures; start += chunkSize) {
    const featureChunk = source.features.slice(start, start + chunkSize);
    const chunkData = source.createChunkData(featureChunk);

    graphics.push(
      ...createGraphicsFromChunkData(chunkData, {
        dataFormat,
        layerId,
        displayScale,
      })
    );

    onProgress?.(Math.min(1, (start + featureChunk.length) / totalFeatures));

    // Yield between chunks so the browser can paint loader progress and keep
    // the UI responsive while many ArcGIS Graphic instances are created.
    await yieldToBrowser();
  }

  return graphics;
}

function createGraphicsFromChunkData(data, { dataFormat, layerId, displayScale }) {
  switch (normalizeDataFormat(dataFormat)) {
    case "esri-json":
      return esriJsonToGraphics(data, {
        layerId,
        displayScale,
      });

    case "geojson":
      return geoJsonToGraphics(data, {
        layerId,
        displayScale,
      });

    default:
      throw new Error(`Unsupported data format: ${dataFormat}`);
  }
}

function createFeatureChunkSource(data, dataFormat) {
  switch (normalizeDataFormat(dataFormat)) {
    case "esri-json":
      return createEsriJsonChunkSource(data);

    case "geojson":
      return createGeoJsonChunkSource(data);

    default:
      throw new Error(`Unsupported data format: ${dataFormat}`);
  }
}

function createGeoJsonChunkSource(data) {
  const features = Array.isArray(data?.features) ? data.features : [];

  return {
    features,
    createChunkData: (featureChunk) => ({
      ...data,
      features: featureChunk,
    }),
  };
}

function createEsriJsonChunkSource(data) {
  if (Array.isArray(data)) {
    return {
      features: data,
      createChunkData: (featureChunk) => featureChunk,
    };
  }

  const features = Array.isArray(data?.features) ? data.features : [];

  return {
    features,
    createChunkData: (featureChunk) => ({
      ...data,
      features: featureChunk,
    }),
  };
}

async function mapGraphicsInChunks(graphics, mapGraphic, { chunkSize, onProgress }) {
  const mappedGraphics = [];

  if (graphics.length === 0) {
    onProgress?.(1);
    return mappedGraphics;
  }

  for (let start = 0; start < graphics.length; start += chunkSize) {
    const chunk = graphics.slice(start, start + chunkSize);

    for (const graphic of chunk) {
      mappedGraphics.push(mapGraphic(graphic));
    }

    onProgress?.(Math.min(1, (start + chunk.length) / graphics.length));
    await yieldToBrowser();
  }

  return mappedGraphics;
}

async function addGraphicsInChunks(layer, graphics, { chunkSize, onProgress }) {
  if (graphics.length === 0) {
    onProgress?.(1);
    return;
  }

  for (let start = 0; start < graphics.length; start += chunkSize) {
    const chunk = graphics.slice(start, start + chunkSize);

    layer.addMany(chunk);

    onProgress?.(Math.min(1, (start + chunk.length) / graphics.length));
    await yieldToBrowser();
  }
}

function createOverviewGraphic(graphic) {
  const status = graphic.attributes?.status;

  return new Graphic({
    geometry: graphic.geometry?.clone?.() ?? graphic.geometry,
    attributes: {
      ...graphic.attributes,
    },
    visible: graphic.visible !== false,
    symbol: getCorrectionSymbol(status, {
      variant: "overview",
    }),
  });
}

function applyAppLayerMetadata(layer, { customId, appLayerId, role, index }) {
  layer.customId = customId;
  layer.appLayerId = appLayerId;
  layer.appLayerRole = role;
  layer.layerType = "graphics";
  layer._index = index;
}

function normalizeDataFormat(dataFormat) {
  const normalizedDataFormat = String(dataFormat ?? "").toLowerCase();

  if (normalizedDataFormat === "esrijson") {
    return "esri-json";
  }

  return normalizedDataFormat;
}

function reportProgress(onProgress, progress, stage, layerTitle) {
  onProgress?.({
    progress: clamp(progress, 0, 1),
    stage,
    layerTitle,
  });
}

function scaleProgress(progress, start, end) {
  return start + clamp(progress, 0, 1) * (end - start);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
