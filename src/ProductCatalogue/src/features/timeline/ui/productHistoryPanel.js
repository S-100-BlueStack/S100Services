import "@esri/calcite-components/components/calcite-icon";
import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { noticeError } from "../../notices/services/noticeService.js";
import {
  isCompatibilityProductContext,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import { fetchProductHistory } from "../api/productHistoryApi.js";
import { onProductHistoryOpen } from "../events/productHistoryEvents.js";
import {
  createProductHistoryBanner,
  createProductHistoryEventList,
  createProductHistoryStateMessage,
  createProductHistorySummary,
} from "./productHistoryRenderers.js";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { isPackageHistoryContext, loadPackageHistory } from "../services/packageHistoryLoader.js";

export function initProductHistoryPanel({
  view,
  registry = createDataSourceRegistry(),
  dataSourceController = null,
  fetchHistory = fetchProductHistory,
  loadPackage = loadPackageHistory,
  watchPopup = watch,
  notifyError = noticeError,
} = {}) {
  const panel = createPanel();

  let popupVisibilityHandle = null;
  let popupSelectionHandle = null;
  let mapClickHandle = null;
  let requestId = 0;
  let destroyed = false;

  document.body.append(panel.root);

  const openHandle = onProductHistoryOpen(({ datasetName, source, productContext, graphic }) =>
    openHistory(datasetName, { source, productContext, graphic })
  );

  panel.closeButton.addEventListener("click", () => {
    setPinned(panel, false);
    closePanel();
  });
  if (view?.popup) {
    popupVisibilityHandle = watchPopup(
      () => view.popup.visible,
      (visible) => {
        if (!visible && !panel.isPinned) {
          closePanel();
        }
      }
    );

    popupSelectionHandle = watchPopup(
      () => getPopupHistoryContextId(view),
      (contextId) => {
        if (panel.root.hidden || panel.isPinned) {
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
      const clickRequestId = requestId;
      requestAnimationFrame(() => {
        if (clickRequestId !== requestId || panel.root.hidden || panel.isPinned) {
          return;
        }
        if (!hasVisiblePopupHistoryContext(view)) {
          closePanel();
        }
      });
    });
  }

  async function openHistory(datasetName, { source = "popup", productContext, graphic } = {}) {
    const currentRequestId = ++requestId;
    if (destroyed) return;
    const selectedGraphic = graphic ?? (source === "popup" ? view?.popup?.selectedFeature : null);
    const context =
      productContext ??
      (selectedGraphic
        ? resolveSelectedProductContext(
            { popup: { selectedFeature: selectedGraphic } },
            datasetName
          )
        : null);
    const originId = context?.identityKey ?? createHistoryContextId(datasetName);
    const originLayer = selectedGraphic?.layer;
    const originDefinition = originLayer?.appSourceDefinition;
    const originAttributes = selectedGraphic?.attributes;
    const originMapping = JSON.stringify(originAttributes?.workUnitMetadata ?? null);
    const sourceState = context && dataSourceController?.getState(context.sourceId);
    const generation = sourceState?.generation;

    if (source === "popup") setPinned(panel, false);
    panel.contextId = originId;
    showPanel(panel);
    setBusy(panel, true);
    renderLoading(panel, datasetName ?? "Product history");

    function hasAuthority() {
      if (!isCurrentRequest(currentRequestId)) return false;
      if (selectedGraphic && originLayer) {
        const currentGraphic =
          !panel.isPinned && source === "popup" ? view?.popup?.selectedFeature : selectedGraphic;
        const state = dataSourceController?.getState(context?.sourceId);
        if (
          (sourceState &&
            (!state?.enabled ||
              state.requestedEnabled === false ||
              state.generation !== generation)) ||
          currentGraphic?.layer !== originLayer ||
          resolveProductContext({ graphic: currentGraphic })?.identityKey !==
            context?.identityKey ||
          (originLayer.graphics && !originLayer.graphics.includes(currentGraphic)) ||
          JSON.stringify(currentGraphic?.attributes?.workUnitMetadata ?? null) !== originMapping ||
          originLayer.appSourceDefinition !== originDefinition ||
          (originDefinition && registry.byId.get(context?.sourceId) !== originDefinition) ||
          (view?.map?.allLayers && !view.map.allLayers.includes(originLayer))
        )
          return false;
      }
      if (source === "popup" && !panel.isPinned && view?.popup) {
        if (!view.popup.visible || getPopupHistoryContextId(view) !== originId) return false;
      }
      return true;
    }

    function assertAuthority() {
      if (!hasAuthority()) throw new Error("Product History request is no longer current.");
    }

    try {
      assertAuthority();
      if (
        !datasetName ||
        !context ||
        context.datasetName?.toUpperCase() !== String(datasetName).trim().toUpperCase()
      ) {
        throw new Error("The selected Product History source context could not be resolved.");
      }
      if (!isCompatibilityProductContext(context) && !registry.byId.has(context.sourceId)) {
        throw new Error("Product History source is missing or replaced.");
      }
      // Compare captured action ownership before any await. A menu from another
      // popup must not borrow the new selection's context.
      if (
        selectedGraphic &&
        resolveProductContext({ graphic: selectedGraphic })?.identityKey !== context.identityKey
      ) {
        throw new Error("Product History popup identity is contradictory.");
      }
      const history = isPackageHistoryContext(context, registry)
        ? await loadPackage(datasetName, {
            productContext: context,
            registry,
            fetchHistory,
            assertCurrent: assertAuthority,
          })
        : await fetchHistory(datasetName, { productContext: context });
      assertAuthority();
      if (history.workUnit?.kind === "package") renderPackageHistory(panel, history);
      else renderHistory(panel, history);
    } catch (error) {
      if (!isCurrentRequest(currentRequestId)) return;
      if (!hasAuthority()) {
        closePanel();
        return;
      }
      renderError(panel, datasetName, error);
      notifyError("History failed to load", getErrorMessage(error));
    } finally {
      if (isCurrentRequest(currentRequestId)) setBusy(panel, false);
    }
  }

  function closePanel() {
    requestId += 1;
    panel.contextId = null;
    hidePanel(panel);
  }

  function isCurrentRequest(currentRequestId) {
    return !destroyed && currentRequestId === requestId;
  }
  function destroy() {
    closePanel();
    destroyed = true;
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
  const graphic = view?.popup?.selectedFeature;
  return graphic ? (resolveProductContext({ graphic })?.identityKey ?? null) : null;
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

function renderPackageHistory(panel, history) {
  const sections = history.members.map((member, index) => {
    const section = document.createElement("section");
    section.className = "pc-product-history-member";
    const heading = document.createElement("h3");
    heading.id = `product-history-member-${index}`;
    heading.className = "pc-product-history-member__heading";
    heading.textContent = `${member.label} · ${member.datasetName}`;
    section.setAttribute("aria-labelledby", heading.id);
    const content = document.createElement("div");
    content.className = "pc-product-history-member__content";
    const memberPanel = { title: document.createElement("span"), content };
    if (member.error) renderError(memberPanel, member.datasetName, new Error(member.error));
    else {
      renderHistory(memberPanel, member.history);
      if (!member.history.events.length) {
        for (const warning of member.history.warnings ?? []) {
          content.appendChild(
            createProductHistoryBanner({ title: "History note", message: warning })
          );
        }
      }
    }
    section.append(heading, content);
    return section;
  });
  panel.title.textContent = history.datasetName;
  panel.content.replaceChildren(...sections);
}
