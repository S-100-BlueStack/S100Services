import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { createLayerIndex } from "../core/layerIndex.js";
import { createPopup } from "../popups/createPopup.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { esriJsonToGraphics } from "../transformers/esriJsonToGraphics.js";

export function createGraphicsLayer(map, layerConfig) {
  const { id } = layerConfig;
  let graphics = [];

  switch (layerConfig.dataFormat) {
    case "esri-json":
      graphics = esriJsonToGraphics(layerConfig.data, { layerId: id });
      break;
    case "geojson":
      graphics = geoJsonToGraphics(layerConfig.data, { layerId: id });
      break;
    default:
      throw new Error(`Unsupported data format: ${layerConfig.dataFormat}`);
  }

  const index = createLayerIndex(graphics);

  const layer = new GraphicsLayer({
    title: id,
    popupTemplate: createPopup(),
  });

  layer.addMany(graphics);

  layer.customId = id;
  layer.layerType = "graphics";
  layer._index = index;

  map.add(layer);

  return layer;
}
