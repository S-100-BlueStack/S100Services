import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import {
  formatDashboardRangeDateTime,
  getDashboardRangeOptions,
} from "../domain/dashboardRange.js";

const SUMMARY_CARDS = [
  {
    key: "totalActivities",
    label: "Activities",
    description: "All recorded operational events",
  },
  {
    key: "productsTouched",
    label: "Products touched",
    description: "Unique products with activity",
  },
  {
    key: "importantChanges",
    label: "Important changes",
    description: "Failed or important events",
  },
  {
    key: "reportsAvailable",
    label: "Reports",
    description: "IC-ENC or validation reports",
  },
  {
    key: "failedOperations",
    label: "Failed",
    description: "Operations needing attention",
  },
];

export function renderDashboardPage({ range, dashboard, loading = false, error = null }) {
  const page = getOrCreateDashboardPage();

  page.replaceChildren(
    createHeader({ range, dashboard, loading }),
    createBody({ range, dashboard, loading, error })
  );
}

function getOrCreateDashboardPage() {
  const existingPage = document.getElementById("product-dashboard-page");

  if (existingPage) {
    return existingPage;
  }

  const shell = document.querySelector("calcite-shell");

  if (!shell) {
    throw new Error("Unable to create Dashboard page because calcite-shell was not found.");
  }

  const page = document.createElement("main");
  page.id = "product-dashboard-page";
  page.className = "pm-dashboard-page";
  page.setAttribute("aria-label", "Dashboard");
  shell.appendChild(page);

  return page;
}

function createHeader({ range, dashboard, loading }) {
  const header = document.createElement("header");
  header.className = "pm-dashboard-header";

  const text = document.createElement("div");
  text.className = "pm-dashboard-header__text";

  const eyebrow = document.createElement("div");
  eyebrow.className = "pm-dashboard-header__eyebrow";
  eyebrow.textContent = "Operational overview";

  const title = document.createElement("h1");
  title.className = "pm-dashboard-header__title";
  title.textContent = "Dashboard";

  const meta = document.createElement("p");
  meta.className = "pm-dashboard-header__meta";
  meta.textContent = createHeaderMeta(range, dashboard);

  text.append(eyebrow, title, meta);

  const actions = document.createElement("div");
  actions.className = "pm-dashboard-header__actions";
  actions.append(createRangeControls(range), createRefreshButton(loading));

  header.append(text, actions);

  return header;
}

function createHeaderMeta(range, dashboard) {
  const generatedAt = dashboard?.generatedAt
    ? `Generated ${formatDashboardRangeDateTime(dashboard.generatedAt)}`
    : "Generated when data is loaded";

  return `${range.displayLabel}. ${generatedAt}.`;
}

function createRangeControls(range) {
  const group = document.createElement("div");
  group.className = "pm-dashboard-range";
  group.setAttribute("aria-label", "Dashboard range");

  for (const option of getDashboardRangeOptions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pm-dashboard-range__button";
    button.textContent = option.label;
    button.title = option.description;
    button.disabled = Boolean(option.disabled);
    button.setAttribute("aria-pressed", String(option.value === range.preset));

    if (option.value === range.preset) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("pm-dashboard-range-change", {
          detail: { preset: option.value },
        })
      );
    });

    group.appendChild(button);
  }

  return group;
}

function createRefreshButton(loading) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-refresh-button";
  button.disabled = loading;
  button.textContent = loading ? "Loading..." : "Refresh";
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("pm-dashboard-refresh"));
  });

  return button;
}

function createBody({ range, dashboard, loading, error }) {
  const body = document.createElement("section");
  body.className = "pm-dashboard-body";

  if (dashboard?.isDemo) {
    body.appendChild(createDemoBanner(dashboard));
  }

  if (error) {
    body.appendChild(createStateMessage("Dashboard could not be loaded", error));
    return body;
  }

  if (loading && !dashboard) {
    body.appendChild(createStateMessage("Loading dashboard activity...", range.displayLabel));
    return body;
  }

  if (!dashboard) {
    body.appendChild(createStateMessage("No dashboard data loaded", range.displayLabel));
    return body;
  }

  body.append(createSummaryCards(dashboard.summary), createDashboardGrid({ dashboard, loading }));

  return body;
}

function createDemoBanner(dashboard) {
  const banner = document.createElement("section");
  banner.className = "pm-dashboard-demo-banner";
  banner.setAttribute("aria-label", "Demo data notice");

  const title = document.createElement("strong");
  title.textContent = "Demo data";

  const message = document.createElement("span");
  message.textContent = dashboard.loadError
    ? ` Backend endpoint is not available yet. ${dashboard.loadError}`
    : " Backend endpoint is not available yet.";

  banner.append(title, message);

  return banner;
}

function createStateMessage(title, description) {
  const state = document.createElement("section");
  state.className = "pm-dashboard-state";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = description;

  state.append(heading, text);

  return state;
}

function createSummaryCards(summary) {
  const cards = document.createElement("section");
  cards.className = "pm-dashboard-summary";
  cards.setAttribute("aria-label", "Dashboard summary");

  for (const cardConfig of SUMMARY_CARDS) {
    const card = document.createElement("article");
    card.className = `pm-dashboard-summary-card pm-dashboard-summary-card--${cardConfig.key}`;

    const value = document.createElement("div");
    value.className = "pm-dashboard-summary-card__value";
    value.textContent = String(summary?.[cardConfig.key] ?? 0);

    const label = document.createElement("div");
    label.className = "pm-dashboard-summary-card__label";
    label.textContent = cardConfig.label;

    const description = document.createElement("div");
    description.className = "pm-dashboard-summary-card__description";
    description.textContent = cardConfig.description;

    card.append(value, label, description);
    cards.appendChild(card);
  }

  return cards;
}

function createDashboardGrid({ dashboard, loading }) {
  const grid = document.createElement("section");
  grid.className = "pm-dashboard-grid";

  const main = document.createElement("div");
  main.className = "pm-dashboard-grid__main";
  main.appendChild(createActivityList(dashboard.activities, loading));

  const aside = document.createElement("aside");
  aside.className = "pm-dashboard-grid__aside";
  aside.append(
    createImportantChanges(dashboard.importantChanges),
    createSummaryRows("Status summary", dashboard.statusSummary),
    createSummaryRows("Operation summary", dashboard.operationSummary)
  );

  grid.append(main, aside);

  return grid;
}

function createActivityList(activities, loading) {
  const section = document.createElement("section");
  section.className = "pm-dashboard-panel pm-dashboard-activity";

  const header = createPanelHeader({
    title: "Activity list",
    count: activities.length,
    status: loading ? "Refreshing" : null,
  });

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "pm-dashboard-activity__table-wrapper";

  if (activities.length === 0) {
    tableWrapper.appendChild(createEmptyText("No activity found for the selected range."));
  } else {
    tableWrapper.appendChild(createActivityTable(activities));
  }

  section.append(header, tableWrapper);

  return section;
}

function createActivityTable(activities) {
  const table = document.createElement("table");
  table.className = "pm-dashboard-activity-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  for (const label of ["Time", "Product", "Activity", "Status", "Links"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");

  for (const activity of activities) {
    tbody.appendChild(createActivityRow(activity));
  }

  table.append(thead, tbody);

  return table;
}

function createActivityRow(activity) {
  const row = document.createElement("tr");
  row.className = `pm-dashboard-activity-table__row is-${activity.severity}`;

  const time = document.createElement("td");
  time.className = "pm-dashboard-activity-table__time";
  time.textContent = formatDashboardRangeDateTime(activity.timestamp);

  const product = document.createElement("td");
  product.className = "pm-dashboard-activity-table__product";
  product.textContent = activity.datasetName || "-";
  product.title = activity.datasetName || "";

  const activityCell = document.createElement("td");
  activityCell.className = "pm-dashboard-activity-table__activity";
  activityCell.append(
    createActivityTitle(activity),
    createActivityDescription(activity),
    createActivityDetails(activity)
  );

  const status = document.createElement("td");
  status.appendChild(createStatusPill(activity.status, activity.severity));

  const links = document.createElement("td");
  links.appendChild(createActivityLinks(activity));

  row.append(time, product, activityCell, status, links);

  return row;
}

function createActivityTitle(activity) {
  const title = document.createElement("div");
  title.className = "pm-dashboard-activity-table__title";
  title.textContent = activity.title;

  return title;
}

function createActivityDescription(activity) {
  const description = document.createElement("div");
  description.className = "pm-dashboard-activity-table__description";
  description.textContent = activity.description || activity.actor || "-";

  return description;
}

function createActivityDetails(activity) {
  const details = document.createElement("div");
  details.className = "pm-dashboard-activity-table__details";

  if (!activity.details.length) {
    return details;
  }

  for (const item of activity.details) {
    const value = document.createElement("span");
    value.className = "pm-dashboard-detail-chip";
    value.textContent = item.label ? `${item.label}: ${item.value}` : item.value;
    details.appendChild(value);
  }

  return details;
}

function createStatusPill(status, severity) {
  const pill = document.createElement("span");
  pill.className = `pm-dashboard-status-pill is-${status} is-${severity}`;
  pill.textContent = toTitleCase(status);

  return pill;
}

function createActivityLinks(activity) {
  const links = document.createElement("div");
  links.className = "pm-dashboard-activity-links";

  links.append(
    createProductLink({
      label: "Review",
      enabled: activity.links.review && activity.datasetName,
      url: activity.datasetName ? buildReviewUrl([activity.datasetName]) : null,
    }),
    createProductLink({
      label: "Analyze",
      enabled: activity.links.analyze && activity.datasetName,
      url: activity.datasetName ? buildAnalyzeUrl([activity.datasetName]) : null,
    }),
    createPlaceholderLink({
      label: "History",
      enabled: activity.links.history,
      title: "History is available in Review and the main map quick panel.",
    }),
    createReportLink({
      label: "IC-ENC",
      report: activity.links.icEncReport,
    }),
    createReportLink({
      label: "Validation",
      report: activity.links.internalValidation,
    })
  );

  return links;
}

function createProductLink({ label, enabled, url }) {
  if (!enabled || !url) {
    return createDisabledLink(label);
  }

  const link = document.createElement("a");
  link.className = "pm-dashboard-link-button";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;

  return link;
}

function createPlaceholderLink({ label, enabled, title }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-link-button";
  button.disabled = !enabled;
  button.textContent = label;
  button.title = enabled ? title : `${label} is not available for this activity.`;

  if (enabled) {
    button.addEventListener("click", () => {
      noticeError("History link is not available", title, {
        dedupeKey: "dashboard-history-link-placeholder",
        storeInCenter: false,
        countAsUnread: false,
      });
    });
  }

  return button;
}

function createReportLink({ label, report }) {
  if (!report?.available) {
    return createDisabledLink(label);
  }

  if (report.url) {
    const link = document.createElement("a");
    link.className = "pm-dashboard-link-button";
    link.href = report.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;

    return link;
  }

  return createPlaceholderLink({
    label,
    enabled: true,
    title: `${label} report metadata is available, but no report URL endpoint exists yet.`,
  });
}

function createDisabledLink(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-dashboard-link-button";
  button.disabled = true;
  button.textContent = label;
  button.title = `${label} is not available for this activity.`;

  return button;
}

function createImportantChanges(activities) {
  const section = document.createElement("section");
  section.className = "pm-dashboard-panel pm-dashboard-important";
  section.appendChild(
    createPanelHeader({
      title: "Important changes",
      count: activities.length,
    })
  );

  const list = document.createElement("div");
  list.className = "pm-dashboard-important__list";

  if (activities.length === 0) {
    list.appendChild(createEmptyText("No important changes in this range."));
  } else {
    for (const activity of activities.slice(0, 8)) {
      list.appendChild(createImportantChange(activity));
    }
  }

  section.appendChild(list);

  return section;
}

function createImportantChange(activity) {
  const item = document.createElement("article");
  item.className = `pm-dashboard-important-item is-${activity.severity}`;

  const header = document.createElement("div");
  header.className = "pm-dashboard-important-item__header";

  const title = document.createElement("strong");
  title.textContent = activity.title;

  const time = document.createElement("span");
  time.textContent = formatDashboardRangeDateTime(activity.timestamp);

  header.append(title, time);

  const product = document.createElement("div");
  product.className = "pm-dashboard-important-item__product";
  product.textContent = activity.datasetName || "-";

  const description = document.createElement("p");
  description.textContent = activity.description || "No details available.";

  item.append(header, product, description);

  return item;
}

function createSummaryRows(title, rows) {
  const section = document.createElement("section");
  section.className = "pm-dashboard-panel pm-dashboard-breakdown";
  section.appendChild(
    createPanelHeader({
      title,
      count: rows.length,
    })
  );

  const list = document.createElement("div");
  list.className = "pm-dashboard-breakdown__rows";

  if (rows.length === 0) {
    list.appendChild(createEmptyText("No summary rows available yet."));
  } else {
    for (const row of rows) {
      list.appendChild(createSummaryRow(row));
    }
  }

  section.appendChild(list);

  return section;
}

function createSummaryRow(row) {
  const item = document.createElement("div");
  item.className = "pm-dashboard-breakdown-row";

  const label = document.createElement("span");
  label.className = "pm-dashboard-breakdown-row__label";
  label.textContent = toTitleCase(row.label);

  const values = document.createElement("span");
  values.className = "pm-dashboard-breakdown-row__value";
  values.textContent = row.failed > 0 ? `${row.count} (${row.failed} failed)` : String(row.count);

  item.append(label, values);

  return item;
}

function createPanelHeader({ title, count, status = null }) {
  const header = document.createElement("header");
  header.className = "pm-dashboard-panel__header";

  const heading = document.createElement("h2");
  heading.className = "pm-dashboard-panel__title";
  heading.textContent = title;

  const meta = document.createElement("div");
  meta.className = "pm-dashboard-panel__meta";
  meta.textContent = status ? `${status} - ${count}` : String(count);

  header.append(heading, meta);

  return header;
}

function createEmptyText(text) {
  const empty = document.createElement("p");
  empty.className = "pm-dashboard-empty";
  empty.textContent = text;

  return empty;
}

function toTitleCase(value) {
  return String(value ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
