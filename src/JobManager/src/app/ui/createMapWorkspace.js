export function createMapWorkspace() {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "job-manager-workspace";

  const mapElement = document.createElement("section");
  mapElement.className = "job-manager-map";
  mapElement.setAttribute("aria-labelledby", "job-manager-map-title");

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-map-title";
  titleElement.className = "job-manager-map__screen-reader-title";
  titleElement.textContent = "Map";

  const mapViewElement = document.createElement("div");
  mapViewElement.className = "job-manager-map__view";

  const mapStatusElement = document.createElement("div");
  mapStatusElement.className = "job-manager-map-status";
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
