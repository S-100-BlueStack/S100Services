import { workspaceOverlayMessage } from "./createWorkspaceOverlay.js";

const RENDER_FAILURE =
  "Workspace rendering failed. The Jobs list remains available. Reload the page to retry the map.";
const JOB_GEOMETRY_NOTE =
  "Job AOI coordinates are unavailable from the API; no Job footprints are shown.";

// Keep ArcGIS LayerView events and overlay preparation failures behind one visible notice boundary.
export function createWorkspaceCoverageStatus({
  view,
  layerId,
  onStatus,
  onCoverageError = () => {},
}) {
  let alive = true;
  let renderError = "";
  let lastReportedError = "";
  let lastOverlayState = null;

  function reportError(message) {
    if (!message) {
      lastReportedError = "";
      return;
    }
    if (message !== lastReportedError) {
      lastReportedError = message;
      onCoverageError(message);
    }
  }

  function updateStatus(state) {
    const error = renderError || (state?.status === "error" ? workspaceOverlayMessage(state) : "");
    onStatus({
      status: error ? "error" : "ready",
      title: error ? "Workspace coverage unavailable" : "Workspace coverage",
      message: [
        renderError ||
          (state
            ? workspaceOverlayMessage(state)
            : "Workspace coverage is loading or unavailable.") ||
          "Workspace coverage is loading or unavailable.",
        JOB_GEOMETRY_NOTE,
      ].join(" "),
    });
  }

  function onOverlayStatus(state) {
    if (!alive) return;
    lastOverlayState = state;
    const overlayFailed = state.status === "error" || state.status === "partial";
    reportError(renderError || (overlayFailed ? workspaceOverlayMessage(state) : ""));
    updateStatus(state);
  }

  const errorHandle = view.on("layerview-create-error", ({ layer }) => {
    if (!alive || layer?.id !== layerId) return;
    renderError = RENDER_FAILURE;
    reportError(renderError);
    onStatus({
      status: "error",
      title: "Workspace rendering failed",
      message: renderError,
    });
  });

  const createdHandle = view.on("layerview-create", ({ layer }) => {
    if (!alive || layer?.id !== layerId || !renderError) return;
    // A newly created LayerView is the authoritative recovery signal.
    renderError = "";
    const state = lastOverlayState;
    const overlayFailed = state?.status === "error" || state?.status === "partial";
    reportError(overlayFailed ? workspaceOverlayMessage(state) : "");
    updateStatus(state);
  });

  return {
    onOverlayStatus,
    remove() {
      alive = false;
      errorHandle.remove();
      createdHandle.remove();
    },
  };
}
