import { getStatusColor } from "../../data/stores/statusStore.js";
import { addNotice } from "../../notices/state/noticeStore.js";

let currentFeatureId = null;
let headerMode = "default";

export function applyHeaderColor(view) {
  if (isOverlapPickerPopup(view)) {
    resetHeaderColor(view);
    return;
  }

  const feature = view.popup.selectedFeature;

  if (!feature) {
    resetHeaderColor(view);
    return;
  }

  headerMode = "feature";

  const featureId = feature.attributes.id ?? feature.uid;
  currentFeatureId = featureId;

  waitForFeatureHeader(view, featureId);
}

export function resetHeaderColor(view) {
  headerMode = "default";
  currentFeatureId = null;

  waitForDefaultHeader(view);
}

function waitForFeatureHeader(view, featureId, remainingFrames = 20) {
  const header = getPopupHeader(view);

  if (!header) {
    if (remainingFrames > 0) {
      requestAnimationFrame(() => waitForFeatureHeader(view, featureId, remainingFrames - 1));
    }

    return;
  }

  if (headerMode !== "feature" || currentFeatureId !== featureId || isOverlapPickerPopup(view)) {
    return;
  }

  const feature = view.popup.selectedFeature;

  if (!feature) {
    resetHeaderColor(view);
    return;
  }

  const attr = feature.attributes;
  const color = getStatusColor(attr.status)?.header ?? "#666";

  if (header.dataset.statusColor !== color) {
    header.style.backgroundColor = color;
    header.style.color = "#ffffff";
    header.dataset.statusColor = color;
  }

  ensureCopyButton(header, attr.datasetName);
}

function waitForDefaultHeader(view, remainingFrames = 20) {
  const header = getPopupHeader(view);

  if (!header) {
    if (remainingFrames > 0) {
      requestAnimationFrame(() => waitForDefaultHeader(view, remainingFrames - 1));
    }

    return;
  }

  if (headerMode !== "default") {
    return;
  }

  // Feature popups set inline styles inside Calcite Shadow DOM.
  // The picker must remove those inline values so theme tokens can apply again.
  header.style.removeProperty("background-color");
  header.style.removeProperty("color");
  delete header.dataset.statusColor;

  removeCopyButton(header);
}

function getPopupHeader(view) {
  const popupContainer =
    view.popup.container ??
    view.container?.querySelector(".esri-popup") ??
    document.querySelector(".esri-popup");

  if (!popupContainer) {
    return null;
  }

  const heading = popupContainer.querySelector(".esri-features__heading");
  const flowItem =
    heading?.closest("calcite-flow-item") ?? popupContainer.querySelector("calcite-flow-item");

  const panel =
    flowItem?.shadowRoot?.querySelector("calcite-panel") ??
    popupContainer.querySelector("calcite-panel");

  return panel?.shadowRoot?.querySelector(".header") ?? null;
}

function isOverlapPickerPopup(view) {
  const content = view.popup.content;

  return content instanceof Element && content.classList.contains("overlap-picker");
}

function removeCopyButton(header) {
  const btn = header.querySelector(".popup-copy-btn");

  if (btn) {
    btn.remove();
  }
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
          storeInCenter: false,
        });
      } catch {
        addNotice({
          type: "danger",
          message: "Failed to copy dataset name",
          duration: 3000,
          storeInCenter: false,
        });
      }
    });
  }

  // Keep the copy action aligned with the currently selected feature.
  btn.dataset.datasetName = datasetName;
}
