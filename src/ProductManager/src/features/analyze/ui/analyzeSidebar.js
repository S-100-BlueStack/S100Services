import { getStatusName } from "../../data/stores/statusStore.js";

export function renderAnalyzeSidebar({ datasetNames, products, loading }) {
  const panel = getOrCreateAnalyzePanel();
  const calcitePanel = panel.querySelector("calcite-panel");
  const content = panel.querySelector(".analyze-sidebar__content");

  calcitePanel.heading = createHeading(datasetNames);

  content.replaceChildren(
    createDatasetForm(datasetNames),
    loading ? createLoadingState(datasetNames) : createProductsContent(products)
  );
}

function getOrCreateAnalyzePanel() {
  const existingPanel = document.getElementById("analyze-sidebar-panel");

  if (existingPanel) {
    return existingPanel;
  }

  const shell = document.querySelector("calcite-shell");

  if (!shell) {
    throw new Error("Unable to create analyze sidebar because calcite-shell was not found.");
  }

  const shellPanel = document.createElement("calcite-shell-panel");
  shellPanel.id = "analyze-sidebar-panel";
  shellPanel.slot = "panel-start";
  shellPanel.position = "start";
  shellPanel.width = "m";

  const panel = document.createElement("calcite-panel");
  panel.heading = "Analyze";

  const content = document.createElement("div");
  content.className = "analyze-sidebar__content";

  panel.appendChild(content);
  shellPanel.appendChild(panel);

  shell.appendChild(shellPanel);

  return shellPanel;
}

function createHeading(datasetNames) {
  if (datasetNames.length === 0) {
    return "Analyze";
  }

  if (datasetNames.length === 1) {
    return `Analyze ${datasetNames[0]}`;
  }

  return `Analyze ${datasetNames.length} products`;
}

function createDatasetForm(datasetNames) {
  const form = document.createElement("form");
  form.className = "analyze-dataset-form";

  const label = document.createElement("label");
  label.className = "analyze-dataset-form__label";
  label.htmlFor = "analyze-dataset-input";
  label.textContent = "Dataset name(s)";

  const row = document.createElement("div");
  row.className = "analyze-dataset-form__row";

  const input = document.createElement("input");
  input.id = "analyze-dataset-input";
  input.className = "analyze-dataset-form__input";
  input.type = "text";
  input.value = datasetNames.join("&");
  input.placeholder = "DK5ABC123&DK5ABC456";
  input.autocomplete = "off";

  const button = document.createElement("button");
  button.className = "analyze-dataset-form__button";
  button.type = "submit";
  button.textContent = "Open";

  const help = document.createElement("p");
  help.className = "analyze-dataset-form__help";
  help.textContent = "Use & between dataset names when analyzing more than one product.";

  row.appendChild(input);
  row.appendChild(button);

  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(help);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const nextDatasetNames = input.value
      .split("&")
      .map((value) => value.trim())
      .filter(Boolean);

    if (nextDatasetNames.length === 0) {
      input.focus();
      return;
    }

    form.dispatchEvent(
      new CustomEvent("pm-analyze-dataset-submit", {
        bubbles: true,
        detail: {
          datasetNames: nextDatasetNames,
        },
      })
    );
  });

  return form;
}

function createLoadingState(datasetNames) {
  const container = document.createElement("div");
  container.className = "analyze-sidebar__loading";

  if (datasetNames.length === 0) {
    container.textContent = "Enter a dataset name to load product analysis.";
    return container;
  }

  container.textContent = `Loading analysis for ${datasetNames.join(", ")}...`;

  return container;
}

function createProductsContent(products) {
  const container = document.createElement("div");
  container.className = "analyze-products";

  if (products.length === 0) {
    const empty = document.createElement("p");
    empty.className = "analyze-sidebar__empty";
    empty.textContent = "No products were loaded.";
    container.appendChild(empty);
    return container;
  }

  container.appendChild(createProductCollapseControls(container));

  const list = document.createElement("div");
  list.className = "analyze-products__list";

  for (const product of products) {
    list.appendChild(createProductCard(product));
  }

  container.appendChild(list);

  return container;
}

function createProductCollapseControls(container) {
  const actions = document.createElement("div");
  actions.className = "analyze-products__actions";

  const openAllButton = document.createElement("button");
  openAllButton.type = "button";
  openAllButton.className = "analyze-products__action-button";
  openAllButton.textContent = "Open all";

  const collapseAllButton = document.createElement("button");
  collapseAllButton.type = "button";
  collapseAllButton.className = "analyze-products__action-button";
  collapseAllButton.textContent = "Collapse all";

  openAllButton.addEventListener("click", () => {
    setProductCardsOpen(container, true);
  });

  collapseAllButton.addEventListener("click", () => {
    setProductCardsOpen(container, false);
  });

  actions.appendChild(openAllButton);
  actions.appendChild(collapseAllButton);

  return actions;
}

function setProductCardsOpen(container, open) {
  const cards = container.querySelectorAll(".analyze-product-card");

  for (const card of cards) {
    card.open = open;
  }
}

function createProductCard(product) {
  const card = document.createElement("details");
  card.className = "analyze-product-card";
  card.open = true;

  const summary = document.createElement("summary");
  summary.className = "analyze-product-card__summary";

  const title = document.createElement("span");
  title.className = "analyze-product-card__title";
  title.textContent = product.datasetName;

  const status = document.createElement("span");
  status.className = "analyze-product-card__status";
  status.textContent = getStatusName(product.status);

  summary.appendChild(title);
  summary.appendChild(status);

  const content = document.createElement("div");
  content.className = "analyze-product-card__content";

  const rows = document.createElement("div");
  rows.className = "analyze-product-card__rows";

  rows.appendChild(createInfoRow("Edition", product.edition));
  rows.appendChild(createInfoRow("Update", product.update));
  rows.appendChild(createInfoRow("Status", getStatusName(product.status)));
  rows.appendChild(createInfoRow("Usage band", product.usageBand));
  rows.appendChild(createInfoRow("Issue date", product.issueDate));
  rows.appendChild(createInfoRow("AOI geometry", product.aoiGeometry ? "Loaded" : "Missing"));

  if (product.errorMessage) {
    rows.appendChild(createInfoRow("Message", product.errorMessage));
  }

  if (product.loadError) {
    rows.appendChild(createInfoRow("Load warning", product.loadError));
  }

  content.appendChild(rows);
  content.appendChild(createXmlBlock(product.xml));
  content.appendChild(createHistoryBlock(product));

  card.appendChild(summary);
  card.appendChild(content);

  return card;
}

function createInfoRow(label, value) {
  const row = document.createElement("div");
  row.className = "analyze-info-row";

  const labelElement = document.createElement("span");
  labelElement.className = "analyze-info-row__label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "analyze-info-row__value";
  valueElement.textContent = value ?? "-";

  row.appendChild(labelElement);
  row.appendChild(valueElement);

  return row;
}

function createXmlBlock(xml) {
  const details = document.createElement("details");
  details.className = "analyze-xml";

  const hasXml = hasText(xml);
  details.open = hasXml;

  const summary = document.createElement("summary");
  summary.textContent = hasXml ? "IC-ENC report XML" : "IC-ENC report XML unavailable";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = hasXml ? formatXml(xml) : "No XML report was returned for this product.";

  pre.appendChild(code);
  details.appendChild(summary);
  details.appendChild(pre);

  return details;
}

function createHistoryBlock(product) {
  const details = document.createElement("details");
  details.className = "analyze-history";

  const summary = document.createElement("summary");
  summary.textContent = "History";

  const content = document.createElement("div");
  content.className = "analyze-history__content";

  const title = document.createElement("h4");
  title.className = "analyze-history__title";
  title.textContent = "Historical changes are not available yet";

  const message = document.createElement("p");
  message.className = "analyze-history__message";
  message.textContent = `History for ${product.datasetName} will be shown here when the backend endpoint is available.`;

  content.append(title, message);
  details.append(summary, content);

  return details;
}

function formatXml(xml) {
  const text = String(xml ?? "").trim();

  try {
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(text, "application/xml");

    if (documentXml.getElementsByTagName("parsererror").length > 0) {
      return text;
    }

    return new XMLSerializer().serializeToString(documentXml).replace(/></g, ">\n<");
  } catch {
    return text;
  }
}

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}
