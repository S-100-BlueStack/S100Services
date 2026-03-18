import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { geoJsonToGraphics } from "../transformers/geoJsonToGraphics.js";
import { createLayerIndex } from "../core/layerIndex.js";
import { createPopup } from "../../../ui/createPopup.js";

export function createGraphicsLayer(map, layerConfig) {
  const { data, id } = layerConfig;

  const graphics = geoJsonToGraphics(data);
  const index = createLayerIndex(graphics);

  const layer = new GraphicsLayer({
    title: id,
    popupTemplate: createPopup(),
  });

  layer.addMany(graphics);

  // custom metadata
  layer.customId = id;
  layer.layerType = "graphics";
  layer._index = index;
  map.add(layer);

  return layer;
}
