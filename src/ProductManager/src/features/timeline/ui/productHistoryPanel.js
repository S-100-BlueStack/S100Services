import "@esri/calcite-components/components/calcite-icon";
import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { fetchProductHistory } from "../api/productHistoryApi.js";
import { onProductHistoryOpen } from "../events/productHistoryEvents.js";

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

  async function openHistory(datasetName, { source = "popup" } = {}) {
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
      const history = await fetchProductHistory(datasetName);

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
  root.className = "pm-product-history-panel";
  root.hidden = true;
  root.setAttribute("aria-label", "Product history");

  const header = document.createElement("div");
  header.className = "pm-product-history-panel__header";

  const titleWrap = document.createElement("div");

  const eyebrow = document.createElement("div");
  eyebrow.className = "pm-product-history-panel__eyebrow";
  eyebrow.textContent = "History";

  const title = document.createElement("h2");
  title.className = "pm-product-history-panel__title";
  title.textContent = "Product history";

  titleWrap.append(eyebrow, title);

  const actions = document.createElement("div");
  actions.className = "pm-product-history-panel__actions";

  const pinButton = createIconButton({
    className: "pm-product-history-panel__pin",
    icon: "pushpin",
    label: "Pin product history panel",
    scale: "s",
  });

  const closeButton = createIconButton({
    className: "pm-product-history-panel__close",
    icon: "x",
    label: "Close product history",
    scale: "m",
  });

  const content = document.createElement("div");
  content.className = "pm-product-history-panel__content";

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
    createStateMessage({
      title: "Loading history...",
      message: "Checking whether historical changes are available for this product.",
    })
  );
}

function renderHistory(panel, history) {
  panel.title.textContent = history.datasetName;

  if (!history.events.length) {
    panel.content.replaceChildren(
      createStateMessage({
        title: history.endpointAvailable
          ? "No historical changes found"
          : "Historical changes are not available yet",
        message: history.endpointAvailable
          ? "No history events were returned for this product."
          : "The history UI is ready, but the backend endpoint has not been implemented yet.",
      })
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  if (history.isDemo) {
    fragment.appendChild(
      createBanner({
        title: "Demo history",
        message:
          "This product history is generated in the frontend until the backend endpoint is available.",
      })
    );
  }

  for (const warning of history.warnings) {
    fragment.appendChild(
      createBanner({
        title: "History note",
        message: warning,
      })
    );
  }

  fragment.appendChild(createHistorySummary(history));
  fragment.appendChild(createHistoryEventList(history.events));

  panel.content.replaceChildren(fragment);
}

function renderError(panel, datasetName, error) {
  panel.title.textContent = datasetName;
  panel.content.replaceChildren(
    createStateMessage({
      title: "History could not be loaded",
      message: getErrorMessage(error),
    })
  );
}

function createHistorySummary(history) {
  const container = document.createElement("section");
  container.className = "pm-product-history-summary";
  container.setAttribute("aria-label", "History summary");

  container.appendChild(
    createSummaryItem({
      label: "Events",
      value: history.events.length,
    })
  );

  container.appendChild(
    createSummaryItem({
      label: "Latest",
      value: formatHistoryTimestamp(history.events[0]?.timestamp),
    })
  );

  return container;
}

function createSummaryItem({ label, value }) {
  const item = document.createElement("div");
  item.className = "pm-product-history-summary__item";

  const labelElement = document.createElement("span");
  labelElement.className = "pm-product-history-summary__label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "pm-product-history-summary__value";
  valueElement.textContent = value ?? "-";

  item.append(labelElement, valueElement);

  return item;
}

function createHistoryEventList(events) {
  const list = document.createElement("ol");
  list.className = "pm-product-history-list";

  for (const event of events) {
    list.appendChild(createHistoryEventItem(event));
  }

  return list;
}

function createHistoryEventItem(event) {
  const item = document.createElement("li");
  item.className = `pm-product-history-list__item pm-product-history-list__item--${event.type}`;

  const marker = document.createElement("span");
  marker.className = "pm-product-history-list__marker";
  marker.appendChild(createEventIcon(event.type));

  const body = document.createElement("div");
  body.className = "pm-product-history-list__body";

  const header = document.createElement("div");
  header.className = "pm-product-history-list__header";

  const title = document.createElement("div");
  title.className = "pm-product-history-list__title";
  title.textContent = event.title ?? "History event";

  header.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "pm-product-history-list__meta";
  meta.textContent = createEventMetaText(event);

  body.append(header, meta);

  if (event.description) {
    const description = document.createElement("p");
    description.className = "pm-product-history-list__description";
    description.textContent = event.description;
    body.appendChild(description);
  }

  const visibleDetails = getVisibleEventDetails(event.details);

  if (visibleDetails.length > 0) {
    body.appendChild(createEventDetails(visibleDetails));
  }

  item.append(marker, body);

  return item;
}

function createEventIcon(type) {
  const icon = document.createElement("calcite-icon");
  icon.scale = "s";
  icon.icon = getEventIcon(type);
  icon.setAttribute("aria-hidden", "true");

  return icon;
}

function createEventDetails(details) {
  const list = document.createElement("dl");
  list.className = "pm-product-history-list__details";

  for (const detail of details) {
    const term = document.createElement("dt");
    term.textContent = detail.label;

    const description = document.createElement("dd");
    description.textContent = detail.value;

    list.append(term, description);
  }

  return list;
}

function getVisibleEventDetails(details) {
  return details.filter((detail) => {
    return normalizeDetailLabel(detail.label) !== "owner";
  });
}

function normalizeDetailLabel(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase();
}

function createBanner({ title, message }) {
  const container = document.createElement("div");
  container.className = "pm-product-history-banner";

  const heading = document.createElement("h3");
  heading.className = "pm-product-history-banner__title";
  heading.textContent = title;

  const body = document.createElement("p");
  body.className = "pm-product-history-banner__message";
  body.textContent = message;

  container.append(heading, body);

  return container;
}

function createStateMessage({ title, message }) {
  const container = document.createElement("div");
  container.className = "pm-product-history-state";

  const heading = document.createElement("h3");
  heading.className = "pm-product-history-state__title";
  heading.textContent = title;

  const body = document.createElement("p");
  body.className = "pm-product-history-state__message";
  body.textContent = message;

  container.append(heading, body);

  return container;
}

function createEventMetaText(event) {
  const parts = [formatHistoryTimestamp(event.timestamp), event.actor, event.source].filter(
    Boolean
  );

  return parts.join(" • ");
}

function getEventIcon(type) {
  switch (type) {
    case "freeze":
      return "snow";

    case "unfreeze":
      return "brightness";

    case "export":
      return "upload";

    case "send":
      return "send";

    case "rollback":
      return "undo";

    case "analysis":
      return "magnifying-glass";

    case "status":
      return "information";

    default:
      return "clock";
  }
}

function formatHistoryTimestamp(timestamp) {
  if (!timestamp) {
    return "Unknown time";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown history error.";
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
