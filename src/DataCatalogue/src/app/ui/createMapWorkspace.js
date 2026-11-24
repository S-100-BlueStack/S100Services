import { createWorkspaceColorLegend } from "../../features/map/workspaces/createWorkspaceColorLegend.js";

export function createMapWorkspace({ live = false, packageInformationElement = null } = {}) {
  const workspaceElement = document.createElement("main");
  workspaceElement.className = "data-catalogue-workspace";

  // Both side panels float over the same MapView. Only the Action Bar takes layout width.
  const shell = document.createElement("div");
  shell.className = "dc-map-shell";

  const actionBar = document.createElement("calcite-action-bar");
  actionBar.className = "dc-map-action-bar";
  actionBar.layout = "vertical";
  actionBar.expandToggleDisabled = true;
  actionBar.overflowMode = "none";
  actionBar.scale = "s";
  actionBar.setAttribute("aria-label", "Map actions");

  const pipelineAction = document.createElement("calcite-action");
  pipelineAction.icon = "layers";
  pipelineAction.text = "Workstreams";
  pipelineAction.title = "Show Workstreams";
  pipelineAction.setAttribute("aria-controls", "data-catalogue-pipelines-panel");
  pipelineAction.setAttribute("aria-expanded", String(live));
  pipelineAction.hidden = !live;
  actionBar.append(pipelineAction);

  const panelHost = document.createElement("div");
  panelHost.className = "dc-map-side-panel";
  const pipelinePanel = document.createElement("section");
  pipelinePanel.id = "data-catalogue-pipelines-panel";
  pipelinePanel.className = "dc-map-pipelines-panel";
  pipelinePanel.setAttribute("aria-label", "Workstreams");
  pipelinePanel.hidden = !live;
  const panelHeading = document.createElement("h2");
  panelHeading.textContent = "Workstreams";
  const pipelineContent = document.createElement("div");
  pipelineContent.className = "dc-map-pipelines-panel__content";
  pipelinePanel.append(panelHeading, pipelineContent);
  panelHost.append(pipelinePanel);

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
  const basemapHost = document.createElement("div");
  basemapHost.className = "dc-basemap-control dc-basemap-control--main";
  mapElement.append(titleElement, mapViewElement, mapStatusElement, basemapHost);
  if (live) mapElement.append(createWorkspaceColorLegend());

  shell.append(actionBar, mapElement, panelHost);
  if (live && packageInformationElement) shell.append(packageInformationElement);
  workspaceElement.append(shell);
  let pipelinesOpen = live;
  let jobsVisible = false;

  function syncPanel() {
    const pipelineVisible = live && pipelinesOpen && !jobsVisible;
    if (!pipelineVisible && pipelinePanel.contains?.(document.activeElement)) {
      pipelineAction.focus?.({ preventScroll: true });
    }
    pipelinePanel.hidden = !pipelineVisible;
    pipelinePanel.inert = !pipelineVisible;
    panelHost.hidden = !pipelineVisible && !jobsVisible;
    panelHost.inert = panelHost.hidden;
    panelHost.setAttribute("aria-hidden", String(panelHost.hidden));
    pipelineAction.active = pipelineVisible;
    pipelineAction.setAttribute("aria-expanded", String(pipelineVisible));
  }
  syncPanel();

  return {
    element: workspaceElement,
    mapViewElement,
    mapStatusElement,
    basemapHost,
    panelHost,
    actionBar,
    pipelineAction,
    pipelineContent,
    setJobsVisible(visible) {
      jobsVisible = Boolean(visible);
      if (jobsVisible) pipelinesOpen = false;
      syncPanel();
    },
    setPipelinesPanelOpen(open) {
      pipelinesOpen = Boolean(open);
      syncPanel();
    },
    togglePipelinesPanel() {
      pipelinesOpen = !pipelinesOpen;
      syncPanel();
    },
  };
}
