import { addNotice } from "../../notices/state/noticeStore.js";
import { getStatusColor } from "../../data/stores/statusStore.js";
import {
  addProductCollectionProduct,
  hasProductCollectionProduct,
  removeProductCollectionProduct,
  subscribeProductCollection,
} from "../../productCollection/state/productCollectionStore.js";

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

  ensureCollectionButton(header, attr);
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

  // Feature popups set inline styles inside Calcite Shadow DOM. The picker must
  // remove those inline values so theme tokens can apply again.
  header.style.removeProperty("background-color");
  header.style.removeProperty("color");
  delete header.dataset.statusColor;

  removeCopyButton(header);
  removeCollectionButton(header);
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

function isReviewOrAnalyzeRoute() {
  return (
    document.body.classList.contains("pm-analyze-route") ||
    document.body.classList.contains("pm-review-route")
  );
}

function getHeaderActions(header) {
  const actions = header.querySelector(".header-actions--end");

  if (!actions) {
    return null;
  }

  // Calcite hides the end-actions container when it has no slotted/default
  // actions. Header buttons are inserted into this internal container, so it
  // must be explicitly unhidden when we add our custom actions.
  actions.hidden = false;
  actions.removeAttribute("hidden");

  return actions;
}

function removeCopyButton(header) {
  removeHeaderButton(header, ".popup-copy-btn");
}

function removeCollectionButton(header) {
  removeHeaderButton(header, ".popup-product-collection-btn");
  removeHeaderButton(header, ".popup-analyze-collection-btn");
}

function removeHeaderButton(header, selector) {
  const btn = header.querySelector(selector);

  if (!btn) {
    return;
  }

  btn.cleanup?.();
  btn.remove();
}

function ensureCopyButton(header, datasetName) {
  const actions = getHeaderActions(header);

  if (!actions) {
    return;
  }

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

function ensureCollectionButton(header, attributes) {
  if (isReviewOrAnalyzeRoute()) {
    removeCollectionButton(header);
    return;
  }

  const datasetName = attributes?.datasetName;
  const actions = getHeaderActions(header);

  if (!actions || !datasetName) {
    return;
  }

  let btn = actions.querySelector(".popup-product-collection-btn");

  if (!btn) {
    btn = document.createElement("calcite-action");
    btn.className = "popup-product-collection-btn";
    btn.scale = "m";
    btn.appearance = "transparent";

    actions.prepend(btn);

    btn.addEventListener("click", () => {
      const datasetName = btn.dataset.datasetName;
      const isSelected = hasProductCollectionProduct(datasetName);

      if (isSelected) {
        removeProductCollectionProduct(datasetName);

        addNotice({
          type: "info",
          message: `${datasetName} removed from collection`,
          duration: 2200,
          storeInCenter: false,
        });

        syncCollectionButtonState(btn);
        return;
      }

      const result = addProductCollectionProduct({ datasetName });

      if (result.added) {
        addNotice({
          type: "success",
          message: `${datasetName} added to collection`,
          duration: 2200,
          storeInCenter: false,
        });
      } else if (result.reason === "already-added") {
        addNotice({
          type: "info",
          message: `${datasetName} is already in the collection`,
          duration: 2200,
          storeInCenter: false,
        });
      } else {
        addNotice({
          type: "danger",
          message: "Selected product could not be added to collection",
          duration: 3000,
          storeInCenter: false,
        });
      }

      syncCollectionButtonState(btn);
    });

    btn.cleanup = subscribeProductCollection(() => {
      syncCollectionButtonState(btn);
    });
  }

  btn.dataset.datasetName = datasetName;
  syncCollectionButtonState(btn);
}

function syncCollectionButtonState(btn) {
  const datasetName = btn.dataset.datasetName;
  const isSelected = hasProductCollectionProduct(datasetName);
  const title = isSelected ? "Remove from collection" : "Add to collection";

  btn.icon = isSelected ? "check" : "chart-magnifying-glass";
  btn.title = title;
  btn.text = title;
  btn.toggleAttribute("data-added", isSelected);
  btn.setAttribute("aria-label", title);
}
