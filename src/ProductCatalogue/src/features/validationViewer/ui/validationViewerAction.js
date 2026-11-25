import { getValidationViewerArtifact } from "../domain/validationViewerArtifact.js";

let launchGeneration = 0;

export function createValidationViewerAction(
  artifact,
  expectedDatasetName,
  { ownerDocument = document, loadViewer = () => import("./validationViewer.js") } = {}
) {
  const verified = getValidationViewerArtifact(artifact, expectedDatasetName);
  if (!verified) return null;
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "pc-validation-viewer-action";
  button.textContent = "View report";
  button.dataset.validationViewerKey = verified.url;
  button.setAttribute("aria-label", `View validation report ${verified.fileName}`);
  button.setAttribute("aria-haspopup", "dialog");
  let loading = false;
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (loading || !button.isConnected) return;
    const generation = ++launchGeneration;
    const view = ownerDocument.defaultView;
    const location = view?.location.href;
    const retire = () => {
      if (generation === launchGeneration) launchGeneration++;
    };
    loading = true;
    button.setAttribute("aria-busy", "true");
    view?.addEventListener("pagehide", retire, { once: true });
    try {
      const { openValidationViewer } = await loadViewer();
      if (
        generation !== launchGeneration ||
        !button.isConnected ||
        view?.location.href !== location
      )
        return;
      openValidationViewer(verified, button);
      button.textContent = "View report";
      button.setAttribute("aria-label", `View validation report ${verified.fileName}`);
    } catch {
      // Keep the existing download available even if the lazy module fails.
      if (generation === launchGeneration && button.isConnected) {
        button.textContent = "Retry view";
        button.setAttribute("aria-label", `Retry viewing ${verified.fileName}`);
      }
    } finally {
      loading = false;
      button.removeAttribute("aria-busy");
      view?.removeEventListener("pagehide", retire);
    }
  });
  return button;
}

export function appendValidationViewerAction(container, artifact, expectedDatasetName) {
  const button = createValidationViewerAction(artifact, expectedDatasetName);
  if (button) container.appendChild(button);
}
