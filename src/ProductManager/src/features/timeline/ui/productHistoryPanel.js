import { noticeError } from "../../notices/services/noticeService.js";
import { fetchProductHistory } from "../api/timelineApi.js";
import { onProductHistoryOpen } from "../events/productHistoryEvents.js";

export function initProductHistoryPanel() {
  const panel = createPanel();

  document.body.append(panel.root);

  const openHandle = onProductHistoryOpen(async ({ datasetName }) => {
    await openHistory(datasetName);
  });

  async function openHistory(datasetName) {
    if (!datasetName) {
      noticeError("Cannot open history", "The selected feature does not have a datasetName.");
      return;
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

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pm-product-history-panel__close";
  closeButton.setAttribute("aria-label", "Close product history");
  closeButton.textContent = "×";

  const content = document.createElement("div");
  content.className = "pm-product-history-panel__content";

  closeButton.addEventListener("click", () => {
    hidePanel({ root });
  });

  header.append(titleWrap, closeButton);
  root.append(header, content);

  return {
    root,
    title,
    content,
  };
}

function showPanel(panel) {
  panel.root.hidden = false;
}

function hidePanel(panel) {
  panel.root.hidden = true;
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
