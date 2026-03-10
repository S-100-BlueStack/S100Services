import WebMap from "@arcgis/core/WebMap.js";

export function createMap(webId) {
  return new WebMap({
    portalItem: {
      id: webId,
    },
  });
}
