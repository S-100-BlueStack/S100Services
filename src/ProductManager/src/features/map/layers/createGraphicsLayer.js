import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createLayerIndexAsync } from "../core/layerIndex.js";
import { createPopup } from "../popups/createPopup.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { esriJsonToGraphics } from "../transformers/esriJsonToGraphics.js";

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

  reportProgress(onProgress, 0, "Preparing layer", title);

  const graphics = await createGraphicsFromData(data, {
    dataFormat,
    layerId: id,
    displayScale,
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0, 0.72), "Creating graphics", title);
    },
  });

  const layerIndex = await createLayerIndexAsync(graphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.72, 0.84), "Indexing graphics", title);
    },
  });

  const layer = new GraphicsLayer({
    title,
    popupTemplate,
  });

  applyAppLayerMetadata(layer, {
    customId: id,
    appLayerId: id,
    role: "data",
    index: layerIndex,
  });

  map.add(layer);

  await addGraphicsInChunks(layer, graphics, {
    chunkSize: graphicsChunkSize,
    onProgress: (progress) => {
      reportProgress(onProgress, scaleProgress(progress, 0.84, 1), "Adding graphics", title);
    },
  });

  reportProgress(onProgress, 1, "Layer ready", title);

  return layer;
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
