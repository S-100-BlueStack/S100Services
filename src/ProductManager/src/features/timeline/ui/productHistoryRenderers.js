import "@esri/calcite-components/components/calcite-icon";

let historyDetailsId = 0;

export function createProductHistorySummary(history) {
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
      className: "pm-product-history-summary__item--wide",
    })
  );

  return container;
}

export function createProductHistoryEventList(events) {
  const list = document.createElement("ol");
  list.className = "pm-product-history-list";

  for (const event of events) {
    list.appendChild(createProductHistoryEventItem(event));
  }

  return list;
}

export function createProductHistoryBanner({ title, message }) {
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

export function createProductHistoryStateMessage({ title, message }) {
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

export function formatHistoryTimestamp(timestamp) {
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

function createSummaryItem({ label, value, className = null }) {
  const item = document.createElement("div");
  item.className = ["pm-product-history-summary__item", className].filter(Boolean).join(" ");

  const labelElement = document.createElement("span");
  labelElement.className = "pm-product-history-summary__label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "pm-product-history-summary__value";
  valueElement.textContent = value ?? "-";

  item.append(labelElement, valueElement);

  return item;
}

function createProductHistoryEventItem(event) {
  const item = document.createElement("li");
  item.className = `pm-product-history-list__item pm-product-history-list__item--${event.type}`;

  const marker = document.createElement("span");
  marker.className = "pm-product-history-list__marker";
  marker.appendChild(createEventIcon(event.type));

  const body = document.createElement("div");
  body.className = "pm-product-history-list__body";

  const visibleDetails = getVisibleEventDetails(event.details ?? []);

  if (visibleDetails.length > 0) {
    body.appendChild(createCollapsedEventSummary(event, visibleDetails));
  } else {
    body.appendChild(createStaticEventSummary(event));
  }

  item.append(marker, body);

  return item;
}

function createCollapsedEventSummary(event, visibleDetails) {
  const detailsId = `product-history-event-details-${++historyDetailsId}`;
  const fragment = document.createDocumentFragment();
  const summaryButton = document.createElement("button");
  summaryButton.type = "button";
  summaryButton.className = "pm-product-history-list__summary";
  summaryButton.setAttribute("aria-expanded", "false");
  summaryButton.setAttribute("aria-controls", detailsId);

  const summaryContent = createEventSummaryContent(event);
  const chevron = document.createElement("calcite-icon");
  chevron.icon = "chevron-down";
  chevron.scale = "s";
  chevron.className = "pm-product-history-list__chevron";
  chevron.setAttribute("aria-hidden", "true");

  summaryButton.append(summaryContent, chevron);

  const detailsPanel = document.createElement("div");
  detailsPanel.id = detailsId;
  detailsPanel.className = "pm-product-history-list__details-panel";
  detailsPanel.hidden = true;
  detailsPanel.appendChild(createEventDetails(visibleDetails));

  summaryButton.addEventListener("click", () => {
    const isExpanded = summaryButton.getAttribute("aria-expanded") === "true";
    const nextExpanded = !isExpanded;

    // Keep every event independent so users can expand only the history rows they need.
    summaryButton.setAttribute("aria-expanded", String(nextExpanded));
    detailsPanel.hidden = !nextExpanded;
    chevron.icon = nextExpanded ? "chevron-up" : "chevron-down";
  });

  fragment.append(summaryButton, detailsPanel);

  return fragment;
}

function createStaticEventSummary(event) {
  const container = document.createElement("div");
  container.className = "pm-product-history-list__summary pm-product-history-list__summary--static";
  container.appendChild(createEventSummaryContent(event));

  return container;
}

function createEventSummaryContent(event) {
  const content = document.createElement("span");
  content.className = "pm-product-history-list__summary-content";

  const header = document.createElement("span");
  header.className = "pm-product-history-list__header";

  const title = document.createElement("span");
  title.className = "pm-product-history-list__title";
  title.textContent = event.title ?? "History event";

  const meta = document.createElement("span");
  meta.className = "pm-product-history-list__meta";
  meta.textContent = createEventMetaText(event);

  header.append(title, meta);
  content.appendChild(header);

  if (event.description) {
    const description = document.createElement("span");
    description.className = "pm-product-history-list__description";
    description.textContent = event.description;
    content.appendChild(description);
  }

  return content;
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

function createEventMetaText(event) {
  return formatHistoryTimestamp(event.timestamp);
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
