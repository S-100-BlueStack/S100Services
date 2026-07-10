import { fetchProductCatalog } from "../../products/api/productCatalogApi.js";
import {
  filterProductCatalog,
  findProductCatalogMatch,
  normalizeProductCatalog,
} from "../../products/domain/productCatalog.js";
import { noticeError, noticeWarning } from "../../notices/services/noticeService.js";
import { getAllLayers } from "../core/layerRegistry.js";
import {
  createProductGraphicViewTarget,
  createProductPopupLocation,
  findProductGraphic,
} from "./productGraphicSearch.js";

const PRODUCT_SEARCH_RESULT_LIMIT = 10;
const PRODUCT_SEARCH_CONTAINER_ID = "main-map-product-search";

export function initMainMapProductSearch({ view }) {
  const host = ensureProductSearchHost();

  if (!host) {
    return createNoopSearch();
  }

  const cleanupPosition = bindProductSearchPosition(host);

  let products = [];
  let loading = true;
  let error = null;
  let isOpen = false;
  let destroyed = false;

  const form = document.createElement("form");
  form.className = "main-map-product-search__form";
  form.setAttribute("role", "search");

  const input = document.createElement("input");
  input.className = "main-map-product-search__input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Find product";
  input.setAttribute("aria-label", "Find product on map");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const results = document.createElement("div");
  results.className = "main-map-product-search__results";
  results.hidden = true;
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Matching products");

  form.append(input, results);
  host.replaceChildren(form);
  host.hidden = false;

  const renderResults = () => {
    results.replaceChildren();

    if (loading) {
      results.appendChild(createStateMessage("Loading products..."));
      return;
    }

    const matches = filterProductCatalog(products, input.value, {
      limit: PRODUCT_SEARCH_RESULT_LIMIT,
    });

    if (matches.length === 0) {
      results.appendChild(
        createStateMessage(
          error
            ? "Product catalog unavailable. Type an exact loaded product name."
            : "No matching products."
        )
      );
      return;
    }

    for (const product of matches) {
      results.appendChild(
        createProductOption(product.name, () => {
          void focusProduct(product.name);
        })
      );
    }
  };

  const openResults = () => {
    renderResults();
    results.hidden = false;
    isOpen = true;
    input.setAttribute("aria-expanded", "true");
  };

  const closeResults = () => {
    if (!isOpen) {
      return false;
    }

    results.hidden = true;
    isOpen = false;
    input.setAttribute("aria-expanded", "false");
    return true;
  };

  const focusProduct = async (productName) => {
    const selectedProductName = resolveSelectedProductName(products, productName) ?? productName;
    input.value = selectedProductName;
    closeResults();
    input.blur();

    const graphic = findProductGraphic(getAllLayers(), selectedProductName);

    if (!graphic) {
      noticeWarning(
        "Product not visible on map",
        `${selectedProductName} exists in the product catalog, but no matching map feature is currently loaded.`
      );
      input.focus();
      return;
    }

    const target = createProductGraphicViewTarget(graphic);
    const location = createProductPopupLocation(graphic);

    try {
      if (target) {
        await view.goTo(target, { duration: 450 });
      }
    } catch (goToError) {
      console.warn("[Product search] Failed to navigate to product", goToError);
    }

    // Wait one frame after navigation before opening the popup. In some ArcGIS
    // render cycles the view is still settling after goTo, which can otherwise
    // make a search feel like it only zoomed without opening the feature popup.
    await waitForAnimationFrame();
    openProductPopup(view, graphic, location);
  };

  input.addEventListener("focus", openResults);
  input.addEventListener("input", openResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const closed = closeResults();
      input.blur();

      if (closed) {
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    if (event.key === "ArrowDown" && !results.hidden) {
      const firstOption = results.querySelector(".main-map-product-search__option");
      firstOption?.focus();
      event.preventDefault();
    }
  });

  results.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeResults();
      input.blur();
      event.preventDefault();
      event.stopPropagation();
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

    const typedProductName = input.value.trim();

    if (!typedProductName) {
      input.focus();
      openResults();
      return;
    }

    const match = resolveSelectedProductName(products, typedProductName);

    if (!match && !error) {
      noticeError("Product not found", `${typedProductName} was not found in the product catalog.`);
      input.focus();
      openResults();
      return;
    }

    void focusProduct(match ?? typedProductName);
  });

  void loadCatalog();

  return {
    close: closeResults,
    destroy() {
      destroyed = true;
      cleanupPosition?.();
      host.replaceChildren();
      host.remove();
    },
  };

  async function loadCatalog() {
    loading = true;
    error = null;
    renderResultsIfOpen();

    try {
      products = normalizeProductCatalog(await fetchProductCatalog());
    } catch (catalogError) {
      products = [];
      error =
        catalogError instanceof Error ? catalogError.message : "Unknown product catalog error.";
      console.warn("[Product search] Product catalog could not be loaded", catalogError);
    } finally {
      loading = false;

      if (!destroyed) {
        renderResultsIfOpen();
      }
    }
  }

  function renderResultsIfOpen() {
    if (isOpen) {
      renderResults();
    }
  }
}

function openProductPopup(view, graphic, location) {
  const popupOptions = {
    features: [graphic],
    location,
  };

  if (typeof view?.openPopup === "function") {
    view.openPopup(popupOptions);
    return;
  }

  view?.popup?.open?.(popupOptions);
}

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function ensureProductSearchHost() {
  const existingHost = document.getElementById(PRODUCT_SEARCH_CONTAINER_ID);

  if (existingHost instanceof HTMLElement) {
    return existingHost;
  }

  const header = document.getElementById("header");

  if (!header || !document.body) {
    return null;
  }

  const host = document.createElement("div");
  host.id = PRODUCT_SEARCH_CONTAINER_ID;
  host.className = "main-map-product-search";

  // Keep the search out of the navbar. The navbar already contains route
  // navigation and operational actions, so the map search behaves better as a
  // map overlay on narrow screens.
  document.body.appendChild(host);

  return host;
}

function bindProductSearchPosition(host) {
  const updatePosition = () => {
    const header = document.getElementById("header");
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;

    host.style.setProperty("--main-map-product-search-top", `${Math.max(8, headerBottom + 10)}px`);
  };

  updatePosition();
  window.addEventListener("resize", updatePosition);

  return () => {
    window.removeEventListener("resize", updatePosition);
  };
}

function createProductOption(productName, onClick) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "main-map-product-search__option";
  option.setAttribute("role", "option");
  option.textContent = productName;
  option.title = `Open ${productName} on map`;
  option.addEventListener("click", onClick);

  return option;
}

function createStateMessage(message) {
  const state = document.createElement("div");
  state.className = "main-map-product-search__state";
  state.textContent = message;

  return state;
}

function resolveSelectedProductName(products, productName) {
  return findProductCatalogMatch(products, productName)?.name ?? null;
}

function getResultOptions(container) {
  return [...container.querySelectorAll(".main-map-product-search__option")];
}

function createNoopSearch() {
  return {
    close() {
      return false;
    },
    destroy() {},
  };
}
