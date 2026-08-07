import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPopupActionBar } from "../../map/popups/popupActionBar.js";
import { closePopupActionDropdown } from "../../map/popups/popupActionDropdown.js";

const DISPLAY_FIELDS = Object.freeze([
  Object.freeze({ fieldName: "sourceLabel", label: "Source" }),
  Object.freeze({ fieldName: "datasetName", label: "Product" }),
  Object.freeze({ fieldName: "edition", label: "Edition" }),
  Object.freeze({ fieldName: "update", label: "Update" }),
  Object.freeze({ fieldName: "status", label: "Status" }),
  Object.freeze({ fieldName: "displayScale", label: "Display scale" }),
]);

/**
 * Creates the source-aware popup used by registry-backed Product layers.
 * It deliberately has no compatibility API refresh or job subscriptions.
 */
export function createDataSourcePopupTemplate(source) {
  return {
    title: `${source.label}: {datasetName}`,
    outFields: ["*"],
    content: ({ graphic } = {}) => createDataSourcePopupContent({ source, graphic }),
  };
}

function createDataSourcePopupContent({ source, graphic }) {
  const attributes = graphic?.attributes ?? {};
  const context = resolveProductContext({ graphic, attributes });
  const container = document.createElement("div");
  container.className = "popup-container popup-container--with-action-bar";

  const section = document.createElement("div");
  section.className = "popup-section";
  renderAttributeRows(section, attributes);

  const actionBar = createPopupActionBar({
    graphic,
    attributes,
    productContext: context,
  });
  if (actionBar) {
    container.appendChild(actionBar);
    closeOwnedDropdownWhenDisconnected(container, actionBar);
  }
  container.appendChild(section);

  if (!context && import.meta.env?.DEV) {
    console.warn("[Data sources] Popup Product context resolution failed closed.", {
      sourceId: source.id,
      layerId: graphic?.layer?.customId,
    });
  }

  return container;
}

function renderAttributeRows(section, attributes) {
  let renderedRows = 0;

  for (const field of DISPLAY_FIELDS) {
    const value = readAttribute(attributes, field.fieldName);
    if (value === null || value === undefined || value === "") {
      continue;
    }

    section.appendChild(createAttributeRow(field.label, value));
    renderedRows += 1;
  }

  if (renderedRows === 0) {
    section.appendChild(createAttributeRow("Details", "No displayable attributes."));
  }
}

function createAttributeRow(label, value) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const labelElement = document.createElement("span");
  labelElement.className = "popup-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "popup-value";
  valueElement.textContent = String(value);

  row.append(labelElement, valueElement);
  return row;
}

function readAttribute(attributes, requestedName) {
  if (Object.hasOwn(attributes, requestedName)) {
    return attributes[requestedName];
  }

  const normalizedRequestedName = normalizeAttributeName(requestedName);
  for (const [name, value] of Object.entries(attributes)) {
    if (normalizeAttributeName(name) === normalizedRequestedName) {
      return value;
    }
  }

  return null;
}

function normalizeAttributeName(value) {
  return String(value ?? "")
    .replace(/[_\s-]/g, "")
    .toLowerCase();
}

function closeOwnedDropdownWhenDisconnected(container, actionBar) {
  let hasBeenConnected = container.isConnected;
  const observer = new MutationObserver(() => {
    if (container.isConnected) {
      hasBeenConnected = true;
      return;
    }
    if (!hasBeenConnected) {
      return;
    }

    if (actionBar.querySelector?.('[aria-expanded="true"]')) {
      closePopupActionDropdown();
    }
    observer.disconnect();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  requestAnimationFrame(() => {
    if (container.isConnected) {
      hasBeenConnected = true;
    }
  });
}
