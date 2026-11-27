import { getIcEncReportArtifact } from "../domain/icEncReportArtifact.js";
import { openIcEncReportViewer } from "./icEncReportViewer.js";

export function appendIcEncReportViewerAction(
  container,
  artifact,
  datasetName,
  selectedUrl,
  { open = openIcEncReportViewer } = {}
) {
  const verified = getIcEncReportArtifact(artifact, datasetName, selectedUrl);
  if (!verified) return;
  const button = container.ownerDocument.createElement("button");
  button.type = "button";
  button.className = "pc-validation-viewer-action";
  button.dataset.icEncReportKey = verified.url;
  button.textContent = "View report";
  button.setAttribute("aria-label", `View IC-ENC report ${verified.fileName}`);
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!button.isConnected) return;
    open(verified, button);
  });
  container.appendChild(button);
}
