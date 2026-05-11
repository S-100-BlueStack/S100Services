import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createLayerIndex } from "../core/layerIndex.js";
import { createPopup } from "../popups/createPopup.js";
import { resolveScaleRanges } from "../config/scaleRanges.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { esriJsonToGraphics } from "../transformers/esriJsonToGraphics.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";

export function createGraphicsLayer(map, layerConfig) {
  const { id, dataFormat = "geojson", data, displayScale } = layerConfig;
  const popupTemplate = createPopup();
  const scaleRanges = resolveScaleRanges(layerConfig);

  const detailGraphics = createGraphicsFromData(data, {
    dataFormat,
    layerId: id,
    displayScale,
  });

  const overviewGraphics = detailGraphics.map((graphic) => createOverviewGraphic(graphic));

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

  overviewLayer.addMany(overviewGraphics);
  detailLayer.addMany(detailGraphics);

  applyAppLayerMetadata(overviewLayer, {
    customId: `${id}:overview`,
    appLayerId: id,
    role: "overview",
    index: createLayerIndex(overviewGraphics),
  });

  applyAppLayerMetadata(detailLayer, {
    customId: `${id}:detail`,
    appLayerId: id,
    role: "detail",
    index: createLayerIndex(detailGraphics),
  });

  map.add(overviewLayer);
  map.add(detailLayer);

  console.table([
    {
      layer: overviewLayer.title,
      customId: overviewLayer.customId,
      role: overviewLayer.appLayerRole,
      graphics: overviewLayer.graphics.length,
      minScale: overviewLayer.minScale,
      maxScale: overviewLayer.maxScale,
    },
    {
      layer: detailLayer.title,
      customId: detailLayer.customId,
      role: detailLayer.appLayerRole,
      graphics: detailLayer.graphics.length,
      minScale: detailLayer.minScale,
      maxScale: detailLayer.maxScale,
    },
  ]);

  return [overviewLayer, detailLayer];
}

function createGraphicsFromData(data, { dataFormat, layerId, displayScale }) {
  switch (dataFormat) {
    case "esri-json":
    case "esrijson":
      return esriJsonToGraphics(data, { layerId, displayScale });

    case "geojson":
      return geoJsonToGraphics(data, { layerId, displayScale });

    default:
      throw new Error(`Unsupported data format: ${dataFormat}`);
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
    symbol: getCorrectionSymbol(status, { variant: "overview" }),
  });
}

function applyAppLayerMetadata(layer, { customId, appLayerId, role, index }) {
  layer.customId = customId;
  layer.appLayerId = appLayerId;
  layer.appLayerRole = role;
  layer.layerType = "graphics";
  layer._index = index;
}
