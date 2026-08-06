import { noticeError, noticeWarning } from "../../notices/services/noticeService.js";
import {
  createProductGraphicViewTarget,
  createProductPopupLocation,
} from "./productGraphicSearch.js";

const PRODUCT_SEARCH_RESULT_LIMIT = 10;
const PRODUCT_SEARCH_CONTAINER_ID = "main-map-product-search";

export function initMainMapProductSearch({ view, productSearchIndex } = {}) {
  const host = ensureProductSearchHost();
  if (!host || !productSearchIndex) return createNoopSearch();

  const cleanupPosition = bindProductSearchPosition(host);
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

  let isOpen = false;
  let selectedResultId = null;
  let destroyed = false;

  function renderResults() {
    results.replaceChildren();
    const matches = productSearchIndex.search(input.value, {
      limit: PRODUCT_SEARCH_RESULT_LIMIT,
    });

    if (matches.length === 0) {
      results.appendChild(
        createStateMessage(
          productSearchIndex.getEntries().length === 0
            ? "No active products are loaded."
            : "No matching products."
        )
      );
      return;
    }

    const duplicateLabels = getDuplicateLabels(matches);
    for (const match of matches) {
      results.appendChild(
        createProductOption(
          match,
          () => {
            void focusProduct(match.id);
          },
          { showSource: duplicateLabels.has(normalizeResultLabel(match.label)) }
        )
      );
    }
  }

  function openResults() {
    renderResults();
    results.hidden = false;
    isOpen = true;
    input.setAttribute("aria-expanded", "true");
  }

  function closeResults() {
    if (!isOpen) return false;
    results.hidden = true;
    isOpen = false;
    input.setAttribute("aria-expanded", "false");
    return true;
  }

  async function focusProduct(resultId) {
    const result = productSearchIndex.resolve(resultId);
    if (!result) {
      selectedResultId = null;
      noticeWarning(
        "Product no longer available",
        "The selected product is no longer loaded from an active data source."
      );
      input.focus();
      openResults();
      return;
    }

    selectedResultId = result.id;
    input.value = result.label;
    closeResults();
    input.blur();

    let graphic = result.graphic;
    if (!graphic) {
      selectedResultId = null;
      noticeWarning(
        "Product not visible on map",
        `${result.label} is no longer available in the loaded map representation.`
      );
      input.focus();
      return;
    }

    await navigateToGraphic(view, graphic, { duration: 450 });
    await waitForAnimationFrame();

    const currentResult = productSearchIndex.resolve(result.id);
    if (!currentResult?.graphic) {
      selectedResultId = null;
      noticeWarning(
        "Product no longer available",
        "The selected product was removed before its popup could be opened."
      );
      return;
    }

    if (currentResult.graphic !== graphic) {
      // Refresh can replace the ArcGIS Graphic while navigation is running. Resolve
      // again so the popup and selected-Graphic flow use the committed representation.
      graphic = currentResult.graphic;
      await navigateToGraphic(view, graphic, { duration: 0 });
    }

    const location = createProductPopupLocation(graphic);
    openProductPopup(view, graphic, location);
  }

  function handleInputKeydown(event) {
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
      results.querySelector(".main-map-product-search__option")?.focus();
      event.preventDefault();
    }
  }

  function handleResultsKeydown(event) {
    if (event.key === "Escape") {
      closeResults();
      input.blur();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const options = getResultOptions(results);
    const currentIndex = options.indexOf(document.activeElement);
    if (event.key === "ArrowUp") {
      const previous = options[currentIndex - 1];
      if (previous) previous.focus();
      else input.focus();
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      options[currentIndex + 1]?.focus();
      event.preventDefault();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.focus();
      openResults();
      return;
    }

    const exactMatches = productSearchIndex
      .search(query, { limit: Number.MAX_SAFE_INTEGER })
      .filter(
        (entry) => entry.label.localeCompare(query, undefined, { sensitivity: "base" }) === 0
      );
    if (exactMatches.length === 0) {
      noticeError("Product not found", `${query} was not found in the active loaded data sources.`);
      input.focus();
      openResults();
      return;
    }
    if (exactMatches.length > 1) {
      noticeWarning(
        "Choose a product",
        "More than one active result has that name. Choose the intended source-aware result."
      );
      input.focus();
      openResults();
      return;
    }

    void focusProduct(exactMatches[0].id);
  }

  input.addEventListener("focus", openResults);
  input.addEventListener("input", openResults);
  input.addEventListener("keydown", handleInputKeydown);
  results.addEventListener("keydown", handleResultsKeydown);
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("focusout", handleFocusOut);

  function handleFocusOut() {
    window.setTimeout(() => {
      if (!form.contains(document.activeElement)) closeResults();
    }, 0);
  }

  const unsubscribe = productSearchIndex.subscribe(() => {
    if (destroyed) return;
    if (selectedResultId && !productSearchIndex.resolve(selectedResultId)) {
      selectedResultId = null;
      input.value = "";
    }
    if (isOpen) renderResults();
  });

  return {
    close: closeResults,
    clearSelection() {
      selectedResultId = null;
      input.value = "";
      closeResults();
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      cleanupPosition?.();
      input.removeEventListener("focus", openResults);
      input.removeEventListener("input", openResults);
      input.removeEventListener("keydown", handleInputKeydown);
      results.removeEventListener("keydown", handleResultsKeydown);
      form.removeEventListener("submit", handleSubmit);
      form.removeEventListener("focusout", handleFocusOut);
      host.replaceChildren();
      host.remove();
    },
  };
}

async function navigateToGraphic(view, graphic, { duration } = {}) {
  const target = createProductGraphicViewTarget(graphic);
  if (!target) {
    return;
  }

  try {
    await view.goTo(target, { duration });
  } catch (error) {
    console.warn("[Product search] Failed to navigate to product", error);
  }
}

function openProductPopup(view, graphic, location) {
  const options = { features: [graphic], location };
  if (typeof view?.openPopup === "function") view.openPopup(options);
  else view?.popup?.open?.(options);
}

function waitForAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function ensureProductSearchHost() {
  const existingHost = document.getElementById(PRODUCT_SEARCH_CONTAINER_ID);
  if (existingHost instanceof HTMLElement) return existingHost;

  const header = document.getElementById("header");
  if (!header || !document.body) return null;

  const host = document.createElement("div");
  host.id = PRODUCT_SEARCH_CONTAINER_ID;
  host.className = "main-map-product-search";
  // Search remains a map overlay rather than competing for compact navbar space.
  document.body.appendChild(host);
  return host;
}

function bindProductSearchPosition(host) {
  const updatePosition = () => {
    const headerBottom = document.getElementById("header")?.getBoundingClientRect().bottom ?? 0;
    host.style.setProperty("--main-map-product-search-top", `${Math.max(8, headerBottom + 10)}px`);
  };
  updatePosition();
  window.addEventListener("resize", updatePosition);
  return () => window.removeEventListener("resize", updatePosition);
}

function createProductOption(result, onClick, { showSource = false } = {}) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "main-map-product-search__option";
  option.setAttribute("role", "option");
  option.dataset.searchResultId = result.id;
  const sourceSuffix = result.sourceLabel ? ` from ${result.sourceLabel}` : "";
  option.textContent =
    showSource && result.sourceLabel ? `${result.label} · ${result.sourceLabel}` : result.label;
  option.title = `Open ${result.label}${sourceSuffix} on map`;
  option.addEventListener("click", onClick, { once: true });
  return option;
}

function getDuplicateLabels(results) {
  const counts = new Map();
  for (const result of results) {
    const key = normalizeResultLabel(result.label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function normalizeResultLabel(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function createStateMessage(message) {
  const state = document.createElement("div");
  state.className = "main-map-product-search__state";
  state.textContent = message;
  return state;
}

function getResultOptions(container) {
  return [...container.querySelectorAll(".main-map-product-search__option")];
}

function createNoopSearch() {
  return {
    close: () => false,
    clearSelection() {},
    destroy() {},
  };
}
