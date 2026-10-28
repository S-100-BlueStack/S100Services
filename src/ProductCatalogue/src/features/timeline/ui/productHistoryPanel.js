import "@esri/calcite-components/components/calcite-icon";
import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { fetchProductHistory } from "../api/productHistoryApi.js";
import { onProductHistoryOpen } from "../events/productHistoryEvents.js";
import {
  createProductHistoryBanner,
  createProductHistoryEventList,
  createProductHistoryStateMessage,
  createProductHistorySummary,
} from "./productHistoryRenderers.js";
export function initProductHistoryPanel({ view } = {}) {
  const panel = createPanel();

  let popupVisibilityHandle = null;
  let popupSelectionHandle = null;
  let mapClickHandle = null;
  let requestId = 0;

  document.body.append(panel.root);

  const openHandle = onProductHistoryOpen(async ({ datasetName, source }) => {
    await openHistory(datasetName, {
      source,
      productContext: resolveSelectedProductContext(view, datasetName),
    });
  });

  panel.closeButton.addEventListener("click", () => {
    setPinned(panel, false);
    closePanel();
  });
  if (view?.popup) {
    popupVisibilityHandle = watch(
      () => view.popup.visible,
      (visible) => {
        if (!visible && !panel.isPinned) {
          closePanel();
        }
      }
    );

    popupSelectionHandle = watch(
      () => getPopupHistoryContextId(view),
      (contextId) => {
        if (!contextId || panel.root.hidden || panel.isPinned) {
          return;
        }

        if (panel.contextId && panel.contextId !== contextId) {
          closePanel();
        }
      }
    );
    mapClickHandle = view.on("click", () => {
      if (panel.root.hidden || panel.isPinned) {
        return;
      }

      // ArcGIS updates popup visibility/selection as part of the map click flow.
      // Defer the close check so we react to the settled popup state instead of
      // closing based on the state from before the click.
      requestAnimationFrame(() => {
        if (panel.root.hidden || panel.isPinned) {
          return;
        }
        if (!hasVisiblePopupHistoryContext(view)) {
          closePanel();
        }
      });
    });
  }

  async function openHistory(datasetName, { source = "popup", productContext = null } = {}) {
    if (!datasetName) {
      noticeError("Cannot open history", "The selected feature does not have a datasetName.");
      return;
    }

    if (source === "popup") {
      setPinned(panel, false);
    }

    const currentRequestId = ++requestId;
    panel.contextId = createHistoryContextId(datasetName);
    showPanel(panel);
    setBusy(panel, true);
    renderLoading(panel, datasetName);

    try {
      const history = await fetchProductHistory(datasetName, { productContext });

      if (!isCurrentRequest(currentRequestId)) {
        return;
      }

      renderHistory(panel, history);
    } catch (error) {
      if (!isCurrentRequest(currentRequestId)) {
        return;
      }
      renderError(panel, datasetName, error);
      noticeError("History failed to load", getErrorMessage(error));
    } finally {
      if (isCurrentRequest(currentRequestId)) {
        setBusy(panel, false);
      }
    }
  }

  function closePanel() {
    requestId += 1;
    panel.contextId = null;
    hidePanel(panel);
  }

  function isCurrentRequest(currentRequestId) {
    return currentRequestId === requestId;
  }
  function destroy() {
    requestId += 1;
    openHandle.remove();
    popupVisibilityHandle?.remove();
    popupSelectionHandle?.remove();
    mapClickHandle?.remove();
    panel.root.remove();
  }

  return {
    openHistory,
    close: closePanel,
    destroy,
  };
}

function createPanel() {
  const root = document.createElement("aside");
  root.id = "product-history-panel";
  root.className = "pc-product-history-panel";
  root.hidden = true;
  root.setAttribute("aria-label", "Product history");
  const header = document.createElement("div");
  header.className = "pc-product-history-panel__header";

  const titleWrap = document.createElement("div");

  const eyebrow = document.createElement("div");
  eyebrow.className = "pc-product-history-panel__eyebrow";
  eyebrow.textContent = "History";

  const title = document.createElement("h2");
  title.className = "pc-product-history-panel__title";
  title.textContent = "Product history";

  titleWrap.append(eyebrow, title);
  const actions = document.createElement("div");
  actions.className = "pc-product-history-panel__actions";

  const pinButton = createIconButton({
    className: "pc-product-history-panel__pin",
    icon: "pushpin",
    label: "Pin product history panel",
    scale: "s",
  });

  const closeButton = createIconButton({
    className: "pc-product-history-panel__close",
    icon: "x",
    label: "Close product history",
    scale: "m",
  });
  const content = document.createElement("div");
  content.className = "pc-product-history-panel__content";

  const panel = {
    root,
    title,
    content,
    pinButton,
    closeButton,
    isPinned: false,
    contextId: null,
  };

  pinButton.addEventListener("click", () => {
    setPinned(panel, !panel.isPinned);
  });

  actions.append(pinButton, closeButton);
  header.append(titleWrap, actions);
  root.append(header, content);

  syncPinnedButton(panel);

  return panel;
}
function createIconButton({ className, icon, label, scale = "s" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);

  const iconElement = document.createElement("calcite-icon");
  iconElement.icon = icon;
  iconElement.scale = scale;
  iconElement.setAttribute("aria-hidden", "true");

  button.appendChild(iconElement);

  return button;
}
function showPanel(panel) {
  panel.root.hidden = false;
}

function hidePanel(panel) {
  panel.root.hidden = true;
  setBusy(panel, false);
}

function setBusy(panel, busy) {
  panel.root.toggleAttribute("aria-busy", Boolean(busy));
}

function setPinned(panel, pinned) {
  panel.isPinned = Boolean(pinned);
  syncPinnedButton(panel);
}
function syncPinnedButton(panel) {
  const icon = panel.pinButton.querySelector("calcite-icon");
  const label = panel.isPinned ? "Unpin product history panel" : "Pin product history panel";

  panel.pinButton.toggleAttribute("active", panel.isPinned);
  panel.pinButton.title = label;
  panel.pinButton.setAttribute("aria-label", label);

  if (icon) {
    icon.icon = panel.isPinned ? "unpin" : "pushpin";
  }
}
function renderLoading(panel, datasetName) {
  panel.title.textContent = datasetName;
  panel.content.replaceChildren(
    createProductHistoryStateMessage({
      title: "Loading history...",
      message: "Checking whether historical changes are available for this product.",
    })
  );
}

function renderHistory(panel, history) {
  panel.title.textContent = history.datasetName;
  if (!history.events.length) {
    panel.content.replaceChildren(
      createProductHistoryStateMessage({
        title: history.endpointAvailable
          ? "No historical changes found"
          : "Historical changes are not available yet",
        message: history.endpointAvailable
          ? "No history events were returned for this product."
          : (history.availabilityReason ??
            "The history UI is ready, but the backend endpoint has not been implemented yet."),
      })
    );
    return;
  }
  const fragment = document.createDocumentFragment();

  if (history.isDemo) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "Demo history",
        message:
          "This product history is generated in the frontend until the backend endpoint is available.",
      })
    );
  }

  for (const warning of history.warnings) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "History note",
        message: warning,
      })
    );
  }
  fragment.appendChild(createProductHistorySummary(history));
  fragment.appendChild(createProductHistoryEventList(history.events));

  panel.content.replaceChildren(fragment);
}

function renderError(panel, datasetName, error) {
  panel.title.textContent = datasetName;
  panel.content.replaceChildren(
    createProductHistoryStateMessage({
      title: "History could not be loaded",
      message: getErrorMessage(error),
    })
  );
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown history error.";
}

function resolveSelectedProductContext(view, datasetName) {
  const selectedGraphic = view?.popup?.selectedFeature;
  const context = selectedGraphic ? resolveProductContext({ graphic: selectedGraphic }) : null;
  if (!context) {
    return null;
  }

  const requestedDatasetName = String(datasetName ?? "")
    .trim()
    .toUpperCase();
  return context.datasetName?.toUpperCase() === requestedDatasetName ? context : null;
}

function getPopupHistoryContextId(view) {
  const attributes = view?.popup?.selectedFeature?.attributes;

  if (!attributes) {
    return null;
  }

  return createHistoryContextId(attributes.datasetName ?? attributes.featureKey);
}

function createHistoryContextId(value) {
  const normalizedValue = String(value ?? "").trim();

  return normalizedValue ? normalizedValue : null;
}
function hasVisiblePopupHistoryContext(view) {
  if (!view?.popup?.visible) {
    return false;
  }

  return Boolean(getPopupHistoryContextId(view));
}
