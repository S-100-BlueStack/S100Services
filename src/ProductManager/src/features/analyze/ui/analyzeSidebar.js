import { getStatusName } from '../../data/stores/statusStore.js';
import {
  getEnabledAnalyzeDatasetNames,
  normalizeAnalyzeDatasetItems,
} from '../domain/analyzeDatasetList.js';
import {
  createProductHistoryEventList,
  createProductHistoryStateMessage,
  createProductHistorySummary,
} from '../../timeline/ui/productHistoryRenderers.js';

export function renderAnalyzeSidebar({ datasetItems, datasetNames, products = [], loading = false }) {
  const panel = getOrCreateAnalyzePanel();
  const calcitePanel = panel.querySelector('calcite-panel');
  const content = panel.querySelector('.analyze-sidebar__content');
  const normalizedDatasetItems = normalizeAnalyzeDatasetItems(datasetItems ?? datasetNames);
  const enabledDatasetNames =
    datasetNames === undefined
      ? getEnabledAnalyzeDatasetNames(normalizedDatasetItems)
      : normalizeDatasetNames(datasetNames);

  calcitePanel.heading = createHeading(enabledDatasetNames);

  content.replaceChildren(
    createDatasetManager(normalizedDatasetItems, { loading }),
    loading ? createLoadingState(enabledDatasetNames) : createProductsContent(products)
  );
}

function getOrCreateAnalyzePanel() {
  const existingPanel = document.getElementById('analyze-sidebar-panel');

  if (existingPanel) {
    return existingPanel;
  }

  const shell = document.querySelector('calcite-shell');

  if (!shell) {
    throw new Error('Unable to create analyze sidebar because calcite-shell was not found.');
  }

  const shellPanel = document.createElement('calcite-shell-panel');
  shellPanel.id = 'analyze-sidebar-panel';
  shellPanel.slot = 'panel-start';
  shellPanel.position = 'start';
  shellPanel.width = 'm';

  const panel = document.createElement('calcite-panel');
  panel.heading = 'Analyze';

  const content = document.createElement('div');
  content.className = 'analyze-sidebar__content';

  panel.appendChild(content);
  shellPanel.appendChild(panel);

  shell.appendChild(shellPanel);

  return shellPanel;
}

function createHeading(datasetNames) {
  if (datasetNames.length === 0) {
    return 'Analyze';
  }

  if (datasetNames.length === 1) {
    return `Analyze ${datasetNames[0]}`;
  }

  return `Analyze ${datasetNames.length} products`;
}

function createDatasetManager(datasetItems, { loading }) {
  const container = document.createElement('section');
  container.className = 'analyze-dataset-manager';
  container.setAttribute('aria-label', 'Analyze dataset names');
  container.setAttribute('aria-busy', loading ? 'true' : 'false');

  container.appendChild(createDatasetAddForm());
  container.appendChild(createDatasetList(datasetItems));

  return container;
}

function createDatasetAddForm() {
  const form = document.createElement('form');
  form.className = 'analyze-dataset-form';

  const label = document.createElement('label');
  label.className = 'analyze-dataset-form__label';
  label.htmlFor = 'analyze-dataset-input';
  label.textContent = 'Add dataset';

  const row = document.createElement('div');
  row.className = 'analyze-dataset-form__row';

  const input = document.createElement('input');
  input.id = 'analyze-dataset-input';
  input.className = 'analyze-dataset-form__input';
  input.type = 'text';
  input.placeholder = 'DK5ABC123';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const button = document.createElement('button');
  button.className = 'analyze-dataset-form__button';
  button.type = 'submit';
  button.textContent = 'Add';

  const help = document.createElement('p');
  help.className = 'analyze-dataset-form__help';
  help.textContent = 'Add one product at a time, or paste multiple names from an existing Analyze URL.';

  row.appendChild(input);
  row.appendChild(button);

  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(help);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const datasetNames = parseDatasetInput(input.value);

    if (datasetNames.length === 0) {
      input.focus();
      return;
    }

    dispatchAnalyzeDatasetAdd(form, datasetNames);
  });

  return form;
}

function createDatasetList(datasetItems) {
  const details = document.createElement('details');
  details.className = 'analyze-dataset-list';
  details.open = true;

  const enabledCount = datasetItems.filter((item) => item.enabled).length;

  const summary = document.createElement('summary');
  summary.className = 'analyze-dataset-list__summary';

  const title = document.createElement('span');
  title.className = 'analyze-dataset-list__title';
  title.textContent = 'Dataset list';

  const count = document.createElement('span');
  count.className = 'analyze-dataset-list__count';
  count.textContent =
    datasetItems.length === 0 ? '0 datasets' : `${enabledCount}/${datasetItems.length} enabled`;

  summary.appendChild(title);
  summary.appendChild(count);

  const content = document.createElement('div');
  content.className = 'analyze-dataset-list__content';

  if (datasetItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'analyze-dataset-list__empty';
    empty.textContent = 'No dataset names added.';
    content.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'analyze-dataset-list__items';
    list.setAttribute('role', 'list');

    for (const datasetItem of datasetItems) {
      list.appendChild(createDatasetListItem(datasetItem));
    }

    content.appendChild(list);
  }

  details.appendChild(summary);
  details.appendChild(content);

  return details;
}

function createDatasetListItem(datasetItem) {
  const item = document.createElement('div');
  item.className = 'analyze-dataset-list__item';
  item.setAttribute('role', 'listitem');

  if (!datasetItem.enabled) {
    item.classList.add('is-disabled');
  }

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'analyze-dataset-list__item-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = datasetItem.enabled;
  checkbox.setAttribute('aria-label', `Enable ${datasetItem.name}`);

  const name = document.createElement('span');
  name.className = 'analyze-dataset-list__item-name';
  name.textContent = datasetItem.name;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'analyze-dataset-list__remove-button';
  removeButton.title = `Remove ${datasetItem.name}`;
  removeButton.setAttribute('aria-label', `Remove ${datasetItem.name}`);

  checkbox.addEventListener('change', () => {
    dispatchAnalyzeDatasetToggle(item, datasetItem.id, checkbox.checked);
  });

  removeButton.addEventListener('click', () => {
    dispatchAnalyzeDatasetRemove(item, datasetItem.id);
  });

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(name);

  item.appendChild(toggleLabel);
  item.appendChild(removeButton);

  return item;
}

function createLoadingState(datasetNames) {
  const container = document.createElement('div');
  container.className = 'analyze-sidebar__loading';

  if (datasetNames.length === 0) {
    container.textContent = 'Enable or add a dataset name to load product analysis.';
    return container;
  }

  container.textContent = `Loading analysis for ${datasetNames.join(', ')}...`;

  return container;
}

function createProductsContent(products) {
  const container = document.createElement('div');
  container.className = 'analyze-products';

  if (products.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'analyze-sidebar__empty';
    empty.textContent = 'No products were loaded.';
    container.appendChild(empty);
    return container;
  }

  container.appendChild(createProductCollapseControls(container));

  const list = document.createElement('div');
  list.className = 'analyze-products__list';

  for (const product of products) {
    list.appendChild(createProductCard(product));
  }

  container.appendChild(list);

  return container;
}

function createProductCollapseControls(container) {
  const actions = document.createElement('div');
  actions.className = 'analyze-products__actions';

  const openAllButton = document.createElement('button');
  openAllButton.type = 'button';
  openAllButton.className = 'analyze-products__action-button';
  openAllButton.textContent = 'Open all';

  const collapseAllButton = document.createElement('button');
  collapseAllButton.type = 'button';
  collapseAllButton.className = 'analyze-products__action-button';
  collapseAllButton.textContent = 'Collapse all';

  openAllButton.addEventListener('click', () => {
    setProductCardsOpen(container, true);
  });

  collapseAllButton.addEventListener('click', () => {
    setProductCardsOpen(container, false);
  });

  actions.appendChild(openAllButton);
  actions.appendChild(collapseAllButton);

  return actions;
}

function setProductCardsOpen(container, open) {
  const cards = container.querySelectorAll('.analyze-product-card');

  for (const card of cards) {
    card.open = open;
  }
}

function createProductCard(product) {
  const card = document.createElement('details');
  card.className = 'analyze-product-card';
  card.open = true;

  const summary = document.createElement('summary');
  summary.className = 'analyze-product-card__summary';

  const title = document.createElement('span');
  title.className = 'analyze-product-card__title';
  title.textContent = product.datasetName;

  const status = document.createElement('span');
  status.className = 'analyze-product-card__status';
  status.textContent = getStatusName(product.status);

  summary.appendChild(title);
  summary.appendChild(status);

  const content = document.createElement('div');
  content.className = 'analyze-product-card__content';

  const rows = document.createElement('div');
  rows.className = 'analyze-product-card__rows';

  rows.appendChild(createInfoRow('Edition', product.edition));
  rows.appendChild(createInfoRow('Update', product.update));
  rows.appendChild(createInfoRow('Status', getStatusName(product.status)));
  rows.appendChild(createInfoRow('Usage band', product.usageBand));
  rows.appendChild(createInfoRow('Issue date', product.issueDate));
  rows.appendChild(createInfoRow('AOI geometry', product.aoiGeometry ? 'Loaded' : 'Missing'));

  if (product.errorMessage) {
    rows.appendChild(createInfoRow('Message', product.errorMessage));
  }

  if (product.loadError) {
    rows.appendChild(createInfoRow('Load warning', product.loadError));
  }

  content.appendChild(rows);
  content.appendChild(createXmlBlock(product.xml));
  content.appendChild(createHistoryBlock(product));

  card.appendChild(summary);
  card.appendChild(content);

  return card;
}

function createInfoRow(label, value) {
  const row = document.createElement('div');
  row.className = 'analyze-info-row';

  const labelElement = document.createElement('span');
  labelElement.className = 'analyze-info-row__label';
  labelElement.textContent = label;

  const valueElement = document.createElement('span');
  valueElement.className = 'analyze-info-row__value';
  valueElement.textContent = value ?? '-';

  row.appendChild(labelElement);
  row.appendChild(valueElement);

  return row;
}

function createXmlBlock(xml) {
  const details = document.createElement('details');
  details.className = 'analyze-xml';

  const hasXml = hasText(xml);
  details.open = hasXml;

  const summary = document.createElement('summary');
  summary.textContent = hasXml ? 'IC-ENC report XML' : 'IC-ENC report XML unavailable';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = hasXml ? formatXml(xml) : 'No XML report was returned for this product.';

  pre.appendChild(code);
  details.appendChild(summary);
  details.appendChild(pre);

  return details;
}

function createHistoryBlock(product) {
  const details = document.createElement('details');
  details.className = 'analyze-history';

  const summary = document.createElement('summary');
  summary.textContent = 'History';

  const content = document.createElement('div');
  content.className = 'analyze-history__content';

  if (product.historyError) {
    content.append(
      createProductHistoryStateMessage({
        title: 'History could not be loaded',
        message: product.historyError,
      })
    );

    details.append(summary, content);
    return details;
  }

  if (!product.history) {
    content.append(
      createProductHistoryStateMessage({
        title: 'History unavailable',
        message: `History for ${product.datasetName} was not loaded.`,
      })
    );

    details.append(summary, content);
    return details;
  }

  if (product.history.events.length === 0) {
    content.append(
      createProductHistoryStateMessage({
        title: 'No historical changes found',
        message: 'No history events were returned for this product.',
      })
    );

    details.append(summary, content);
    return details;
  }

  content.appendChild(createProductHistorySummary(product.history));
  content.appendChild(createProductHistoryEventList(product.history.events));

  details.append(summary, content);
  return details;
}

function parseDatasetInput(value) {
  return String(value ?? '')
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDatasetNames(datasetNames) {
  return normalizeAnalyzeDatasetItems(datasetNames).map((item) => item.name);
}

function dispatchAnalyzeDatasetAdd(target, datasetNames) {
  target.dispatchEvent(
    new CustomEvent('pm-analyze-dataset-add', {
      bubbles: true,
      detail: {
        datasetNames,
      },
    })
  );
}

function dispatchAnalyzeDatasetToggle(target, id, enabled) {
  target.dispatchEvent(
    new CustomEvent('pm-analyze-dataset-toggle', {
      bubbles: true,
      detail: {
        id,
        enabled,
      },
    })
  );
}

function dispatchAnalyzeDatasetRemove(target, id) {
  target.dispatchEvent(
    new CustomEvent('pm-analyze-dataset-remove', {
      bubbles: true,
      detail: {
        id,
      },
    })
  );
}

function formatXml(xml) {
  const text = String(xml ?? '').trim();

  try {
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(text, 'application/xml');

    if (documentXml.getElementsByTagName('parsererror').length > 0) {
      return text;
    }

    return new XMLSerializer().serializeToString(documentXml).replace(/></g, '>\n<');
  } catch {
    return text;
  }
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}
