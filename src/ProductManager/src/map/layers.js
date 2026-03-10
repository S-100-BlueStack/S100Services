import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

export function createCitiesLayer() {
  const citiesLayer = new FeatureLayer({
    url: "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/Landscape_Trees/FeatureServer/0",
    outFields: ["*"],
  });

  return citiesLayer;
}
