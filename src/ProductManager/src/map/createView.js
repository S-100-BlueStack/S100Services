import MapView from "@arcgis/core/views/MapView.js";
import Attribution from "@arcgis/core/widgets/Attribution.js";
export function createView(map) {
  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [12.56, 55.67], // København
    zoom: 6,
  });
  return view;
}
