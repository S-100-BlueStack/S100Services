import {
  filterProductCatalog,
  normalizeProductCatalog,
  parseProductInput,
  validateProductCatalogSelection,
} from "../domain/productCatalog.js";

const PRODUCT_PICKER_RESULT_LIMIT = 16;

export function createProductPickerForm({
  id,
  eventName,
  labelText = "Add product",
  placeholder = "Search or type product name",
  helpText = "Select an existing product, or type a product name manually.",
  products = [],
  excludedProductNames = [],
  loading = false,
  error = null,
  requireCatalogMatch = false,
  className = "",
} = {}) {
  const normalizedProducts = normalizeProductCatalog(products);
  const form = document.createElement("form");
  form.className = ["pm-product-picker", className].filter(Boolean).join(" ");
  form.dataset.productPicker = id ?? "product-picker";

  const label = document.createElement("label");
  const inputId = id ?? "product-picker-input";
  const labelId = `${inputId}-label`;

  label.id = labelId;
  label.className = "pm-product-picker__label";
  label.textContent = labelText;

  const row = document.createElement("div");
  row.className = "pm-product-picker__row";

  const input = document.createElement("input");
  input.id = inputId;
  input.className = "pm-product-picker__input";
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-labelledby", labelId);

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
    requireCatalogMatch,
  });

  row.append(input, button);
  form.append(label, row, results, help);

  const setMessage = (message) => {
    help.textContent = message;
    help.classList.toggle("is-error", Boolean(message));
  };

  const resetMessage = () => {
    help.textContent = createHelpText({
      helpText,
      loading,
      error,
      productCount: normalizedProducts.length,
      requireCatalogMatch,
    });
    help.classList.remove("is-error");
  };

  const closeResults = () => {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-labelledby", labelId);
  };

  const openResults = () => {
    renderProductResults({
      container: results,
      products: normalizedProducts,
      query: input.value,
      excludedProductNames,
      loading,
      error,
      onSelect(productName) {
        dispatchProductAdd(form, eventName, [productName]);
        input.value = "";
        resetMessage();
        closeResults();
        input.focus();
      },
    });
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("focus", openResults);
  input.addEventListener("input", () => {
    resetMessage();
    openResults();
  });

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

    const validation = validatePickerSelection({
      products: normalizedProducts,
      productNames,
      excludedProductNames,
      loading,
      error,
      requireCatalogMatch,
    });

    if (!validation.canSubmit) {
      setMessage(validation.message);
      input.focus();
      openResults();
      return;
    }

    dispatchProductAdd(form, eventName, validation.productNames);
    input.value = "";
    resetMessage();
    closeResults();
    input.focus();
  });

  return form;
}

function renderProductResults({
  container,
  products,
  query,
  excludedProductNames,
  loading,
  error,
  onSelect,
}) {
  container.replaceChildren();

  if (loading) {
    container.appendChild(createStateMessage("Loading products..."));
    return;
  }

  const matches = filterProductCatalog(products, query, {
    limit: PRODUCT_PICKER_RESULT_LIMIT,
    excludedProductNames,
  });

  if (matches.length === 0) {
    container.appendChild(
      createStateMessage(
        error
          ? "Product catalog is unavailable. Typed input still works."
          : "No matching available products."
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

function createHelpText({ helpText, loading, error, productCount, requireCatalogMatch }) {
  if (loading) {
    return "Loading product catalog. Typed input still works after catalog load.";
  }

  if (error) {
    return "Product catalog could not be loaded. Typed input still works.";
  }

  if (productCount > 0) {
    const suffix = requireCatalogMatch
      ? "Only existing products can be added."
      : `${productCount} products available.`;

    return `${helpText} ${suffix}`;
  }

  return helpText;
}

function validatePickerSelection({
  products,
  productNames,
  excludedProductNames,
  loading,
  error,
  requireCatalogMatch,
}) {
  if (!requireCatalogMatch || loading || error || products.length === 0) {
    return {
      canSubmit: true,
      productNames,
      message: "",
    };
  }

  const result = validateProductCatalogSelection(products, productNames, {
    excludedProductNames,
  });

  if (result.unknown.length > 0) {
    return {
      canSubmit: false,
      productNames: [],
      message: `Product not found: ${result.unknown.join(", ")}.`,
    };
  }

  if (result.valid.length === 0 && result.alreadySelected.length > 0) {
    return {
      canSubmit: false,
      productNames: [],
      message: `Product already added: ${result.alreadySelected.join(", ")}.`,
    };
  }

  return {
    canSubmit: true,
    productNames: result.valid,
    message: "",
  };
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
