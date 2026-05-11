import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createLayerIndex } from "../core/layerIndex.js";
import { createPopup } from "../popups/createPopup.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { esriJsonToGraphics } from "../transformers/esriJsonToGraphics.js";

export function createGraphicsLayer(map, layerConfig) {
  const { data, id, dataFormat = "geojson" } = layerConfig;

  const graphics = createGraphicsFromData(data, {
    dataFormat,
    layerId: id,
  });

  debugGraphicsLayerCreation({
    id,
    data,
    dataFormat,
    graphics,
  });

  const index = createLayerIndex(graphics);

  const layer = new GraphicsLayer({
    title: id,
    popupTemplate: createPopup(),
  });

  layer.addMany(graphics);

  // Keep custom metadata close to the ArcGIS layer instance so other modules can
  // treat GraphicsLayer as the runtime representation of an application layer.
  layer.customId = id;
  layer.layerType = "graphics";
  layer._index = index;

  map.add(layer);

  return layer;
}

function createGraphicsFromData(data, { dataFormat, layerId }) {
  switch (dataFormat) {
    case "geojson":
      return geoJsonToGraphics(data);

    case "esri-json":
    case "esrijson":
      return esriJsonToGraphics(data, { layerId });

    default:
      throw new Error(`Unsupported graphics data format: ${dataFormat}`);
  }
}

function debugGraphicsLayerCreation({ id, data, dataFormat, graphics }) {
  const graphicsWithoutGeometry = graphics.filter((graphic) => !graphic.geometry);

  console.groupCollapsed(`[Map debug] Graphics layer created: ${id}`);

  console.table({
    id,
    dataFormat,
    graphicsCount: graphics.length,
    graphicsWithoutGeometry: graphicsWithoutGeometry.length,
    graphicsWithGeometry: graphics.length - graphicsWithoutGeometry.length,
  });

  if (graphicsWithoutGeometry.length > 0) {
    console.warn(
      `[Map debug] ${graphicsWithoutGeometry.length} graphics in "${id}" have no geometry. They cannot be rendered.`
    );

    console.log("First raw feature:", getFirstFeature(data));
    console.log("First graphic without geometry:", graphicsWithoutGeometry[0]);
    console.log("First graphic attributes:", graphicsWithoutGeometry[0]?.attributes);
  }

  console.groupEnd();
}

function getFirstFeature(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  if (Array.isArray(data?.features)) {
    return data.features[0] ?? null;
  }

  return null;
}
