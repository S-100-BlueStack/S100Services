import {
  filterProductCatalog,
  normalizeProductCatalog,
  parseProductInput,
} from "../domain/productCatalog.js";

const PRODUCT_PICKER_RESULT_LIMIT = 16;

export function createProductPickerForm({
  id,
  eventName,
  labelText = "Add product",
  placeholder = "Search or type product name",
  helpText = "Select an existing product, or type a product name manually.",
  products = [],
  loading = false,
  error = null,
  className = "",
} = {}) {
  const normalizedProducts = normalizeProductCatalog(products);
  const form = document.createElement("form");
  form.className = ["pm-product-picker", className].filter(Boolean).join(" ");
  form.dataset.productPicker = id ?? "product-picker";

  const label = document.createElement("label");
  label.className = "pm-product-picker__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const row = document.createElement("div");
  row.className = "pm-product-picker__row";

  const input = document.createElement("input");
  input.id = id;
  input.className = "pm-product-picker__input";
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const button = document.createElement("button");
  button.className = "pm-product-picker__button";
  button.type = "submit";
  button.textContent = "Add";

  const results = document.createElement("div");
  results.className = "pm-product-picker__results";
  results.hidden = true;
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Available products");

  const help = document.createElement("p");
  help.className = "pm-product-picker__help";
  help.textContent = createHelpText({
    helpText,
    loading,
    error,
    productCount: normalizedProducts.length,
  });

  row.append(input, button);
  form.append(label, row, results, help);

  const closeResults = () => {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const openResults = () => {
    renderProductResults({
      container: results,
      products: normalizedProducts,
      query: input.value,
      loading,
      error,
      onSelect(productName) {
        dispatchProductAdd(form, eventName, [productName]);
        input.value = "";
        closeResults();
        input.focus();
      },
    });
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("focus", openResults);
  input.addEventListener("input", openResults);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeResults();
      return;
    }

    if (event.key === "ArrowDown" && !results.hidden) {
      const firstOption = results.querySelector(".pm-product-picker__option");
      firstOption?.focus();
      event.preventDefault();
    }
  });

  results.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeResults();
      input.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      const options = getResultOptions(results);
      const currentIndex = options.indexOf(document.activeElement);
      const previous = options[currentIndex - 1];

      if (previous) {
        previous.focus();
      } else {
        input.focus();
      }

      event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown") {
      const options = getResultOptions(results);
      const currentIndex = options.indexOf(document.activeElement);
      const next = options[currentIndex + 1];

      next?.focus();
      event.preventDefault();
    }
  });

  form.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!form.contains(document.activeElement)) {
        closeResults();
      }
    }, 0);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const productNames = parseProductInput(input.value);

    if (productNames.length === 0) {
      input.focus();
      openResults();
      return;
    }

    dispatchProductAdd(form, eventName, productNames);
    input.value = "";
    closeResults();
    input.focus();
  });

  return form;
}

function renderProductResults({ container, products, query, loading, error, onSelect }) {
  container.replaceChildren();

  if (loading) {
    container.appendChild(createStateMessage("Loading products..."));
    return;
  }

  const matches = filterProductCatalog(products, query, {
    limit: PRODUCT_PICKER_RESULT_LIMIT,
  });

  if (matches.length === 0) {
    container.appendChild(
      createStateMessage(
        error
          ? "Product catalog is unavailable. Typed input still works."
          : "No matching products. Typed input still works."
      )
    );
    return;
  }

  for (const product of matches) {
    container.appendChild(
      createProductOption(product, () => {
        onSelect(product.name);
      })
    );
  }
}

function createProductOption(product, onClick) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "pm-product-picker__option";
  option.setAttribute("role", "option");
  option.textContent = product.name;
  option.title = `Add ${product.name}`;
  option.addEventListener("click", onClick);

  return option;
}

function createStateMessage(message) {
  const state = document.createElement("div");
  state.className = "pm-product-picker__state";
  state.textContent = message;

  return state;
}

function createHelpText({ helpText, loading, error, productCount }) {
  if (loading) {
    return "Loading product catalog. Typed input still works.";
  }

  if (error) {
    return "Product catalog could not be loaded. Typed input still works.";
  }

  if (productCount > 0) {
    return `${helpText} ${productCount} products available.`;
  }

  return helpText;
}

function getResultOptions(container) {
  return [...container.querySelectorAll(".pm-product-picker__option")];
}

function dispatchProductAdd(target, eventName, productNames) {
  if (!eventName || productNames.length === 0) {
    return;
  }

  target.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      detail: {
        datasetNames: productNames,
        productNames,
      },
    })
  );
}
