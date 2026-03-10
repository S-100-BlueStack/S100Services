import MapView from "@arcgis/core/views/MapView.js";
import Extent from "@arcgis/core/geometry/Extent.js";

export function createView(map) {
  const extent = new Extent({
    xmax: 1705294.8013330558,
    xmin: 487805.81480709196,
    ymax: 7853333.743980687,
    ymin: 7267520.359203253,
    spatialReference: {
      wkid: 102100,
    },
  });
  return new MapView({
    container: "viewDiv",
    map: map,
    popup: {
      defaultPopupTemplateEnabled: false,
      dockEnabled: false,
      visibleElements: {
        collapseButton: false,
        featureNavigation: false,
        featureListLayerTitle: false,
      },
      dockOptions: {
        buttonEnabled: false,
        breakpoint: false,
      },
    },
    // ui: {
    //     components: ["attribution"]
    // },
    container: "viewDiv",
    extent: extent,
    constraints: {
      rotationEnabled: false,
      minScale: 100000000,
    },
    padding: {
      left: 49,
    },
  });
}
