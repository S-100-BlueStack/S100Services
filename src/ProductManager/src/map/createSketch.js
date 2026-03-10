import Sketch from "@arcgis/core/widgets/Sketch";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

export function createSketch(view) {
  const graphicsLayer = new GraphicsLayer();
  return new Sketch({
    layer: graphicsLayer,
    view: view,
    id: "sketch-widget",
    creationMode: "single",
  });
}
