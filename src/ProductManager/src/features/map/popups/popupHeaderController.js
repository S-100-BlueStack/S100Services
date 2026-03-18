import { getStatusColor } from "../../data/stores/statusStore";
import { addNotice } from "../../notices/state/noticeStore";
let currentFeatureId = null;

export function applyHeaderColor(view) {
  const feature = view.popup.selectedFeature;
  if (!feature) return;

  const featureId = feature.attributes.id ?? feature.uid;
  currentFeatureId = featureId;

  waitForHeader(view, featureId);
}

function waitForHeader(view, featureId) {
  const heading = view.popup.container?.querySelector(".esri-features__heading");
  if (!heading) {
    requestAnimationFrame(() => waitForHeader(view, featureId));
    return;
  }

  const flowItem = heading.closest("calcite-flow-item");
  const panel = flowItem?.shadowRoot?.querySelector("calcite-panel");
  const header = panel?.shadowRoot?.querySelector(".header");

  if (!header) {
    requestAnimationFrame(() => waitForHeader(view, featureId));
    return;
  }

  if (currentFeatureId !== featureId) return;

  const feature = view.popup.selectedFeature;
  const attr = feature.attributes;

  const color = getStatusColor(attr.status)?.header ?? "#666";

  if (header.dataset.statusColor !== color) {
    header.style.backgroundColor = color;
    header.dataset.statusColor = color;
  }

  ensureCopyButton(header, attr.datasetName);
}

function ensureCopyButton(header, datasetName) {
  const actions = header.querySelector(".header-actions--end");
  if (!actions) return;

  let btn = actions.querySelector(".popup-copy-btn");

  if (!btn) {
    btn = document.createElement("calcite-action");

    btn.className = "popup-copy-btn";
    btn.icon = "copy-to-clipboard";
    btn.scale = "m";
    btn.title = "Copy dataset name";
    btn.appearance = "transparent";
    actions.prepend(btn);

    btn.addEventListener("click", async () => {
      const datasetName = btn.dataset.datasetName;

      try {
        await navigator.clipboard.writeText(datasetName);

        addNotice({
          type: "success",
          message: "Dataset name copied",
          duration: 2000,
        });
      } catch {
        addNotice({
          type: "danger",
          message: "Failed to copy dataset name",
          duration: 3000,
        });
      }
    });
  }

  // opdater altid datasetName når popup skifter feature
  btn.dataset.datasetName = datasetName;
}
