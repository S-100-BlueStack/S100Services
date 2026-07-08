import "@esri/calcite-components/components/calcite-icon";
import {
  createProductHistoryBanner,
  createProductHistoryStateMessage,
  formatHistoryTimestamp,
} from "../../timeline/ui/productHistoryRenderers.js";
import {
  REVIEW_CONTENT_TYPES,
  getEnabledReviewContentTypes,
  getReviewContentTypeDefinitions,
} from "../domain/reviewProductList.js";

export function createReviewBoard({ productItems, enabledDatasetNames, products, loading, error }) {
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
  const enabledProductItems = productItems.filter((productItem) => productItem.enabled);

  for (const productItem of enabledProductItems) {
    columns.appendChild(
      createProductReviewColumn(
        productItem,
        productsByDatasetName.get(normalizeKey(productItem.datasetName)) ?? {
          datasetName: productItem.datasetName,
        }
      )
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

function createProductReviewColumn(productItem, product) {
  const column = document.createElement("article");
  column.className = "pm-review-column";

  const header = document.createElement("header");
  header.className = "pm-review-column__header";

  const title = document.createElement("h2");
  title.className = "pm-review-column__title";
  title.textContent = productItem.datasetName;
  title.title = productItem.datasetName;

  const meta = document.createElement("div");
  meta.className = "pm-review-column__meta";
  meta.textContent = createColumnMeta(productItem);

  header.append(title, meta);

  const content = document.createElement("div");
  content.className = "pm-review-column__content";

  for (const contentType of getEnabledReviewContentTypes(productItem)) {
    content.appendChild(createReviewContentCard(product, contentType));
  }

  if (!content.hasChildNodes()) {
    content.appendChild(
      createProductHistoryStateMessage({
        title: "No review content selected",
        message: "Select one or more content types in the sidebar for this product.",
      })
    );
  }

  column.append(header, content);

  return column;
}

function createColumnMeta(productItem) {
  const enabledContentTypes = getEnabledReviewContentTypes(productItem);

  if (enabledContentTypes.length === 0) {
    return "No content";
  }

  const labelsById = new Map(
    getReviewContentTypeDefinitions().map((definition) => [definition.id, definition.shortLabel])
  );

  return enabledContentTypes
    .map((contentType) => labelsById.get(contentType) ?? contentType)
    .join(" · ");
}

function createReviewContentCard(product, contentType) {
  if (contentType === REVIEW_CONTENT_TYPES.HISTORY) {
    return createHistoryReviewCard(product);
  }

  if (contentType === REVIEW_CONTENT_TYPES.IC_ENC_REPORTS) {
    return createPendingReviewCard({
      product,
      contentType,
      title: "IC-ENC reports",
      status: "Pending",
      message:
        "IC-ENC report selection is ready in Product Review, but report metadata is not available in the Review model yet.",
    });
  }

  if (contentType === REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS) {
    return createPendingReviewCard({
      product,
      contentType,
      title: "Internal validation",
      status: "Pending",
      message:
        "Internal validation report selection is ready in Product Review, but the backend endpoint is not available yet.",
    });
  }

  return createPendingReviewCard({
    product,
    contentType,
    title: "Review content",
    status: "Unknown",
    message: "This review content type does not have a renderer yet.",
  });
}

function createHistoryReviewCard(product) {
  const card = createContentCardShell({
    product,
    contentType: REVIEW_CONTENT_TYPES.HISTORY,
    title: "History",
    status: createHistoryStatusText(product),
  });

  const actions = document.createElement("div");
  actions.className = "pm-review-content-card__actions";
  actions.append(
    createCardActionButton({
      label: "Open all history events",
      text: "Open all",
      onClick: () => setHistoryEventsOpen(card, true),
    }),
    createCardActionButton({
      label: "Collapse all history events",
      text: "Collapse all",
      onClick: () => setHistoryEventsOpen(card, false),
    })
  );

  card.header.appendChild(actions);
  card.body.appendChild(createHistoryContent(product));

  return card.root;
}

function createPendingReviewCard({ product, contentType, title, status, message }) {
  const card = createContentCardShell({
    product,
    contentType,
    title,
    status,
  });

  card.body.appendChild(
    createProductHistoryStateMessage({
      title: `${title} unavailable`,
      message,
    })
  );

  return card.root;
}

function createContentCardShell({ product, contentType, title, status }) {
  const card = document.createElement("section");
  card.className = `pm-review-content-card pm-review-content-card--${normalizeType(contentType)}`;
  card.dataset.reviewContentType = contentType;
  card.setAttribute("aria-label", `${product.datasetName} ${title}`);

  const header = document.createElement("div");
  header.className = "pm-review-content-card__header";

  const titleElement = document.createElement("h3");
  titleElement.className = "pm-review-content-card__title";
  titleElement.textContent = title;

  const statusElement = document.createElement("span");
  statusElement.className = "pm-review-content-card__status";
  statusElement.textContent = status;

  const body = document.createElement("div");
  body.className = "pm-review-content-card__body";

  header.append(titleElement, statusElement);
  card.append(header, body);

  return {
    root: card,
    header,
    body,
  };
}

function createCardActionButton({ label, text, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-review-content-card__action-button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);

  return button;
}

function setHistoryEventsOpen(card, open) {
  const events = card.root.querySelectorAll(".pm-review-history-event");

  for (const event of events) {
    event.open = open;
  }
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
