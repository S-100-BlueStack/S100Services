export function createMapWorkspace() {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "data-catalogue-workspace";

  const mapElement = document.createElement("section");
  mapElement.className = "data-catalogue-map";
  mapElement.setAttribute("aria-labelledby", "data-catalogue-map-title");

  const titleElement = document.createElement("h2");
  titleElement.id = "data-catalogue-map-title";
  titleElement.className = "data-catalogue-map__screen-reader-title";
  titleElement.textContent = "Map";

  const mapViewElement = document.createElement("div");
  mapViewElement.className = "data-catalogue-map__view";

  const mapStatusElement = document.createElement("div");
  mapStatusElement.className = "data-catalogue-map-status";
  mapStatusElement.setAttribute("role", "status");
  mapStatusElement.setAttribute("aria-live", "polite");

  mapElement.append(titleElement, mapViewElement, mapStatusElement);
  workspaceElement.appendChild(mapElement);

  return {
    element: workspaceElement,
    mapViewElement,
    mapStatusElement,
  };
}
