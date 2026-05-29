import "@esri/calcite-components/components/calcite-icon";
import { watch } from "@arcgis/core/core/reactiveUtils.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { fetchProductHistory } from "../api/timelineApi.js";
import { onProductHistoryOpen } from "../events/productHistoryEvents.js";

export function initProductHistoryPanel({ view } = {}) {
  const panel = createPanel();
  let popupVisibilityHandle = null;

  document.body.append(panel.root);

  const openHandle = onProductHistoryOpen(async ({ datasetName, source }) => {
    await openHistory(datasetName, {
      source,
    });
  });

  if (view?.popup) {
    popupVisibilityHandle = watch(
      () => view.popup.visible,
      (visible) => {
        if (!visible && !panel.isPinned) {
          hidePanel(panel);
        }
      }
    );
  }

  async function openHistory(datasetName, { source = "popup" } = {}) {
    if (!datasetName) {
      noticeError("Cannot open history", "The selected feature does not have a datasetName.");
      return;
    }

    // Opening from a popup always switches context to the selected product.
    // This prevents a pinned panel from silently showing stale history.
    if (source === "popup") {
      setPinned(panel, false);
    }

    showPanel(panel);
    renderLoading(panel, datasetName);

    try {
      const history = await fetchProductHistory(datasetName);
      renderHistory(panel, history);
    } catch (error) {
      renderError(panel, datasetName, error);
      noticeError("History failed to load", error.message);
    }
  }

  function destroy() {
    openHandle.remove();
    popupVisibilityHandle?.remove();
    panel.root.remove();
  }

  return {
    openHistory,
    close: () => hidePanel(panel),
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
  });

  const closeButton = createIconButton({
    className: "pm-product-history-panel__close",
    icon: "x",
    label: "Close product history",
  });

  const content = document.createElement("div");
  content.className = "pm-product-history-panel__content";

  const panel = {
    root,
    title,
    content,
    pinButton,
    isPinned: false,
  };

  pinButton.addEventListener("click", () => {
    setPinned(panel, !panel.isPinned);
  });

  closeButton.addEventListener("click", () => {
    setPinned(panel, false);
    hidePanel(panel);
  });

  actions.append(pinButton, closeButton);
  header.append(titleWrap, actions);
  root.append(header, content);

  syncPinnedButton(panel);

  return panel;
}

function createIconButton({ className, icon, label }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);

  const iconElement = document.createElement("calcite-icon");
  iconElement.icon = icon;
  iconElement.scale = "s";
  iconElement.setAttribute("aria-hidden", "true");

  button.appendChild(iconElement);

  return button;
}

function showPanel(panel) {
  panel.root.hidden = false;
}

function hidePanel(panel) {
  panel.root.hidden = true;
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

  if (!history.endpointAvailable) {
    panel.content.replaceChildren(
      createStateMessage({
        title: "Historical changes are not available yet",
        message: "The history UI is ready, but the backend endpoint has not been implemented yet.",
      })
    );
    return;
  }

  if (!history.events.length) {
    panel.content.replaceChildren(
      createStateMessage({
        title: "No historical changes found",
        message: "No history events were returned for this product.",
      })
    );
    return;
  }

  const list = document.createElement("ol");
  list.className = "pm-product-history-list";

  for (const event of history.events) {
    list.appendChild(createHistoryEventItem(event));
  }

  panel.content.replaceChildren(list);
}

function renderError(panel, datasetName, error) {
  panel.title.textContent = datasetName;

  panel.content.replaceChildren(
    createStateMessage({
      title: "History could not be loaded",
      message: error instanceof Error ? error.message : "Unknown history error.",
    })
  );
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

function createHistoryEventItem(event) {
  const item = document.createElement("li");
  item.className = "pm-product-history-list__item";

  const title = document.createElement("div");
  title.className = "pm-product-history-list__title";
  title.textContent = event.title ?? "History event";

  const meta = document.createElement("div");
  meta.className = "pm-product-history-list__meta";
  meta.textContent = event.timestamp ? formatHistoryTimestamp(event.timestamp) : "Unknown time";

  const description = document.createElement("p");
  description.className = "pm-product-history-list__description";
  description.textContent = event.description ?? "";

  item.append(title, meta, description);

  return item;
}

function formatHistoryTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
