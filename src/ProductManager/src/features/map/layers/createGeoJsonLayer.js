import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import { statusRenderer } from "../renderers/statusRenderer";
import { createPopup } from "../../../ui/createPopup";

export function addGeoJsonLayer(map, url) {
  const layer = new GeoJSONLayer({
    url: url,
    customParameters: {
      nocache: Date.now(),
    },
    title: "Dataset",
    renderer: statusRenderer,
    outFields: ["*"],
    spatialIndex: true,
    objectIdField: "id",
  });

  layer.popupTemplate = createPopup();
  map.add(layer);

  return layer;
}

export function addGeoJsonLayerFromData(map, geoJsonData) {
  const blob = new Blob([JSON.stringify(geoJsonData)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const layer = new GeoJSONLayer({
    url: url,
    title: "Dataset",
    renderer: statusRenderer,
    outFields: ["*"],
    spatialIndex: true,
    objectIdField: "id",
  });

  layer.popupTemplate = createPopup();
  map.add(layer);

  return layer;
}
