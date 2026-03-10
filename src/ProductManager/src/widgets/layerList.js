import LayerList from "@arcgis/core/widgets/LayerList.js";

export function createLayerList(view) {
  return new LayerList({
    view,
    container: "layers-container",
  });
}
