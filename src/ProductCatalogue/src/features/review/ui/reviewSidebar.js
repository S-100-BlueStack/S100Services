import { createProductPickerForm } from "../../products/ui/productPicker.js";
import {
  getReviewContentTypeDefinitions,
  isReviewContentTypeEnabled,
} from "../domain/reviewProductList.js";

export function createReviewSidebar({ productItems, loading, productCatalog }) {
  const sidebar = document.createElement("aside");
  sidebar.className = "pc-review-sidebar pc-scrollbar";
  sidebar.setAttribute("aria-label", "Product Review workspace controls");
  sidebar.setAttribute("aria-busy", loading ? "true" : "false");

  sidebar.append(
    createProductAddForm(productCatalog, productItems),
    createProductList(productItems, loading)
  );

  return sidebar;
}

function createWorkspaceRefreshButton(productItems, loading) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-review-product-list__refresh-button";
  button.title = "Refresh Product Review workspace data.";
  button.setAttribute("aria-label", "Refresh Product Review workspace data");
  button.disabled = loading || !productItems.some((item) => item.enabled);

  const icon = document.createElement("calcite-icon");
  icon.icon = "refresh";
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);

  button.addEventListener("click", () => {
    button.dispatchEvent(new CustomEvent("pc-review-refresh", { bubbles: true }));
  });
  return button;
}

function createProductAddForm(productCatalog, productItems) {
  return createProductPickerForm({
    id: "review-product-input",
    eventName: "pc-review-product-add",
    labelText: "Add product",
    showLabel: false,
    placeholder: "Search or type product name",
    showDefaultHelp: false,
    overlayResults: true,
    products: productCatalog?.products ?? [],
    excludedProductNames: productItems.map((item) => item.datasetName),
    loading: productCatalog?.loading ?? false,
    error: productCatalog?.error ?? null,
    requireCatalogMatch: true,
    className: "pc-review-product-form",
  });
}

function createProductList(productItems, loading) {
  const section = document.createElement("section");
  section.className = "pc-review-product-list";
  section.setAttribute("aria-label", "Selected review products");

  const header = document.createElement("div");
  header.className = "pc-review-product-list__header";

  const title = document.createElement("h2");
  title.className = "pc-review-product-list__title";
  title.textContent = "Products";

  const count = document.createElement("span");
  count.className = "pc-review-product-list__count";
  count.textContent = createProductCountText(productItems);

  const controls = document.createElement("div");
  controls.className = "pc-review-product-list__header-controls";
  controls.append(createWorkspaceRefreshButton(productItems, loading), count);

  header.append(title, controls);
  section.appendChild(header);

  if (productItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "pc-review-product-list__empty";
    empty.textContent = "No products added.";
    section.appendChild(empty);

    return section;
  }

  const list = document.createElement("div");
  list.className = "pc-review-product-list__items pc-scrollbar";
  list.setAttribute("role", "list");

  for (const productItem of productItems) {
    list.appendChild(createProductListItem(productItem));
  }

  section.appendChild(list);
  return section;
}

function createProductListItem(productItem) {
  const item = document.createElement("div");
  item.className = "pc-review-product-list__item";
  item.setAttribute("role", "listitem");

  if (!productItem.enabled) {
    item.classList.add("is-disabled");
  }

  const header = document.createElement("div");
  header.className = "pc-review-product-list__item-header";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "pc-review-product-list__toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = productItem.enabled;
  checkbox.setAttribute("aria-label", `Show ${productItem.datasetName} in Product Review`);

  const content = document.createElement("span");
  content.className = "pc-review-product-list__item-content";

  const name = document.createElement("span");
  name.className = "pc-review-product-list__item-name";
  name.textContent = productItem.datasetName;
  name.title = productItem.datasetName;

  content.appendChild(name);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "pc-review-product-list__remove-button";
  removeButton.title = `Remove ${productItem.datasetName}`;
  removeButton.setAttribute("aria-label", `Remove ${productItem.datasetName}`);

  checkbox.addEventListener("change", () => {
    dispatchReviewProductToggle(item, productItem.id, checkbox.checked);
  });

  removeButton.addEventListener("click", () => {
    dispatchReviewProductRemove(item, productItem.id);
  });

  toggleLabel.append(checkbox, content);
  header.append(toggleLabel, removeButton);
  item.append(header, createContentTypeList(productItem));

  return item;
}

function createContentTypeList(productItem) {
  const list = document.createElement("div");
  list.className = "pc-review-product-list__content-types";
  list.setAttribute("aria-label", `${productItem.datasetName} review content`);

  for (const definition of getReviewContentTypeDefinitions()) {
    list.appendChild(createContentTypeToggle(productItem, definition));
  }

  return list;
}

function createContentTypeToggle(productItem, definition) {
  const label = document.createElement("label");
  label.className = "pc-review-product-list__content-type";
  label.title = definition.description;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isReviewContentTypeEnabled(productItem, definition.id);
  checkbox.disabled = !productItem.enabled;
  checkbox.dataset.reviewProductId = productItem.id;
  checkbox.dataset.reviewContentType = definition.id;
  checkbox.setAttribute("aria-label", `${definition.label} for ${productItem.datasetName}`);

  const text = document.createElement("span");
  text.textContent = definition.shortLabel;

  checkbox.addEventListener("change", () => {
    dispatchReviewContentToggle(label, productItem.id, definition.id, checkbox.checked);
  });

  label.append(checkbox, text);
  return label;
}

function createProductCountText(productItems) {
  const enabledCount = productItems.filter((item) => item.enabled).length;

  if (productItems.length === 0) {
    return "0 products";
  }

  return `${enabledCount}/${productItems.length} visible`;
}

function dispatchReviewProductToggle(target, id, enabled) {
  target.dispatchEvent(
    new CustomEvent("pc-review-product-toggle", {
      bubbles: true,
      detail: {
        id,
        enabled,
      },
    })
  );
}

function dispatchReviewContentToggle(target, id, contentType, enabled) {
  target.dispatchEvent(
    new CustomEvent("pc-review-content-toggle", {
      bubbles: true,
      detail: {
        id,
        contentType,
        enabled,
      },
    })
  );
}

function dispatchReviewProductRemove(target, id) {
  target.dispatchEvent(
    new CustomEvent("pc-review-product-remove", {
      bubbles: true,
      detail: {
        id,
      },
    })
  );
}
