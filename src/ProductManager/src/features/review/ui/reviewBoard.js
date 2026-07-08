import "@esri/calcite-components/components/calcite-icon";
import {
  createProductHistoryBanner,
  createProductHistoryStateMessage,
  formatHistoryTimestamp,
} from "../../timeline/ui/productHistoryRenderers.js";

export function createReviewBoard({ enabledDatasetNames, products, loading, error }) {
  const board = document.createElement("section");
  board.className = "pm-review-board";
  board.setAttribute("aria-label", "Review board");
  board.setAttribute("aria-busy", loading ? "true" : "false");

  if (error) {
    board.appendChild(
      createProductHistoryStateMessage({
        title: "Product Review could not be loaded",
        message: error,
      })
    );
    return board;
  }

  if (loading) {
    board.appendChild(createLoadingState(enabledDatasetNames));
    return board;
  }

  if (enabledDatasetNames.length === 0) {
    board.appendChild(createEmptyState());
    return board;
  }

  const columns = document.createElement("div");
  columns.className = "pm-review-board__columns";

  const productsByDatasetName = new Map(
    products.map((product) => [normalizeKey(product.datasetName), product])
  );

  for (const datasetName of enabledDatasetNames) {
    columns.appendChild(
      createProductReviewColumn(productsByDatasetName.get(normalizeKey(datasetName)) ?? { datasetName })
    );
  }

  board.appendChild(columns);

  return board;
}

function createLoadingState(enabledDatasetNames) {
  return createProductHistoryStateMessage({
    title: "Loading review content...",
    message: `Loading history for ${enabledDatasetNames.join(", ")}.`,
  });
}

function createEmptyState() {
  return createProductHistoryStateMessage({
    title: "Add products to start reviewing",
    message:
      "Use the sidebar to add product names, or open Product Review from the main map collection.",
  });
}

function createProductReviewColumn(product) {
  const column = document.createElement("article");
  column.className = "pm-review-column";

  const header = document.createElement("header");
  header.className = "pm-review-column__header";

  const title = document.createElement("h2");
  title.className = "pm-review-column__title";
  title.textContent = product.datasetName;
  title.title = product.datasetName;

  const meta = document.createElement("div");
  meta.className = "pm-review-column__meta";
  meta.textContent = "History";

  header.append(title, meta);

  const content = document.createElement("div");
  content.className = "pm-review-column__content";
  content.appendChild(createHistoryReviewCard(product));

  column.append(header, content);

  return column;
}

function createHistoryReviewCard(product) {
  const card = document.createElement("section");
  card.className = "pm-review-content-card";
  card.setAttribute("aria-label", `${product.datasetName} history`);

  const header = document.createElement("div");
  header.className = "pm-review-content-card__header";

  const title = document.createElement("h3");
  title.className = "pm-review-content-card__title";
  title.textContent = "History";

  const status = document.createElement("span");
  status.className = "pm-review-content-card__status";
  status.textContent = createHistoryStatusText(product);

  header.append(title, status);

  const body = document.createElement("div");
  body.className = "pm-review-content-card__body";
  body.appendChild(createHistoryContent(product));

  card.append(header, body);

  return card;
}

function createHistoryContent(product) {
  if (product.error) {
    return createProductHistoryStateMessage({
      title: "History could not be loaded",
      message: product.error,
    });
  }

  if (!product.history) {
    return createProductHistoryStateMessage({
      title: "History unavailable",
      message: `History for ${product.datasetName} was not loaded.`,
    });
  }

  if (!product.history.events.length) {
    return createProductHistoryStateMessage({
      title: product.history.endpointAvailable
        ? "No historical changes found"
        : "Historical changes are not available yet",
      message: product.history.endpointAvailable
        ? "No history events were returned for this product."
        : "The history UI is ready, but the backend endpoint has not been implemented yet.",
    });
  }

  const fragment = document.createDocumentFragment();

  if (product.history.isDemo) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "Demo history",
        message:
          "This product history is generated in the frontend until the backend endpoint is available.",
      })
    );
  }

  for (const warning of product.history.warnings ?? []) {
    fragment.appendChild(
      createProductHistoryBanner({
        title: "History note",
        message: warning,
      })
    );
  }

  fragment.appendChild(createCompactHistoryList(product.history.events));

  return fragment;
}

function createCompactHistoryList(events) {
  const list = document.createElement("ol");
  list.className = "pm-review-history-list";

  for (const event of events) {
    list.appendChild(createCompactHistoryItem(event));
  }

  return list;
}

function createCompactHistoryItem(event) {
  const item = document.createElement("li");
  item.className = `pm-review-history-list__item pm-review-history-list__item--${normalizeType(event.type)}`;

  const details = document.createElement("details");
  details.className = "pm-review-history-event";

  const summary = document.createElement("summary");
  summary.className = "pm-review-history-event__summary";

  const marker = document.createElement("span");
  marker.className = "pm-review-history-event__marker";
  marker.appendChild(createEventIcon(event.type));

  const title = document.createElement("span");
  title.className = "pm-review-history-event__title";
  title.textContent = event.title ?? "History event";

  const meta = document.createElement("span");
  meta.className = "pm-review-history-event__meta";
  meta.textContent = formatHistoryTimestamp(event.timestamp);

  summary.append(marker, title, meta);

  const body = document.createElement("div");
  body.className = "pm-review-history-event__body";

  if (event.description) {
    const description = document.createElement("p");
    description.className = "pm-review-history-event__description";
    description.textContent = event.description;
    body.appendChild(description);
  }

  const visibleDetails = getVisibleEventDetails(event.details ?? []);

  if (visibleDetails.length > 0) {
    body.appendChild(createEventDetails(visibleDetails));
  }

  if (!body.hasChildNodes()) {
    const empty = document.createElement("p");
    empty.className = "pm-review-history-event__description";
    empty.textContent = "No additional details were returned for this event.";
    body.appendChild(empty);
  }

  details.append(summary, body);
  item.appendChild(details);

  return item;
}

function createEventIcon(type) {
  const icon = document.createElement("calcite-icon");
  icon.icon = getEventIcon(type);
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");

  return icon;
}

function createEventDetails(details) {
  const list = document.createElement("dl");
  list.className = "pm-review-history-event__details";

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
  return details.filter((detail) => normalizeDetailLabel(detail.label) !== "owner");
}

function normalizeDetailLabel(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase();
}

function createHistoryStatusText(product) {
  if (product.error) {
    return "Failed";
  }

  if (!product.history) {
    return "Unavailable";
  }

  return `${product.history.events.length} event${product.history.events.length === 1 ? "" : "s"}`;
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

function normalizeType(type) {
  return String(type ?? "status")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
