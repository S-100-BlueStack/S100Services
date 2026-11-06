import { noticeError, noticeWarning } from "../../notices/services/noticeService.js";
import {
  createProductGraphicViewTarget,
  createProductPopupLocation,
} from "./productGraphicSearch.js";

const PRODUCT_SEARCH_RESULT_LIMIT = 10;

export function initMainMapProductSearch({
  view,
  productSearchIndex,
  host,
  isGraphicAllowed,
  subscribeFilterChanges,
} = {}) {
  if (!(host instanceof HTMLElement) || !productSearchIndex) return createNoopSearch();
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
  const optionsList = document.createElement("div");
  optionsList.className = "main-map-product-search__list";
  optionsList.setAttribute("role", "listbox");
  optionsList.setAttribute("aria-label", "Matching products");
  const filteredSummary = document.createElement("div");
  filteredSummary.className = "main-map-product-search__filtered-summary";
  filteredSummary.setAttribute("role", "status");
  filteredSummary.title = "Products hidden by current map filters";
  filteredSummary.hidden = true;
  results.append(optionsList, filteredSummary);

  form.append(input, results);
  host.replaceChildren(form);
  host.hidden = false;

  let isOpen = false;
  let selectedResultId = null;
  let selectedResultLabel = null;
  let destroyed = false;
  let selectionGeneration = 0;
  const cancelPendingSelection = () => {
    selectionGeneration += 1;
  };
  const isCurrentSelection = (generation, resultId) =>
    !destroyed && generation === selectionGeneration && selectedResultId === resultId;
  const isResultVisible = (result) =>
    Boolean(result?.graphic) &&
    (typeof isGraphicAllowed !== "function" ||
      isGraphicAllowed(result.graphic, result.graphic.layer));
  function renderResults() {
    optionsList.replaceChildren();
    // Filter before applying the visible-result limit so hidden Products cannot
    // consume every suggestion slot.
    const matches = productSearchIndex.search(input.value, {
      limit: Number.MAX_SAFE_INTEGER,
    });
    const visibleMatches = matches.filter(isResultVisible);
    const filteredCount = matches.length - visibleMatches.length;
    filteredSummary.hidden = filteredCount === 0;
    filteredSummary.textContent = filteredCount ? `${filteredCount} filtered out` : "";

    if (visibleMatches.length === 0) {
      optionsList.appendChild(
        createStateMessage(
          matches.length > 0
            ? "No visible matching products."
            : productSearchIndex.getEntries().length === 0
              ? "No active products are loaded."
              : "No matching products."
        )
      );
      return;
    }
    const suggestions = visibleMatches.slice(0, PRODUCT_SEARCH_RESULT_LIMIT);
    const duplicateLabels = getDuplicateLabels(suggestions);
    for (const match of suggestions) {
      optionsList.appendChild(
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
    if (destroyed) return;
    const generation = ++selectionGeneration;
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

    if (!isResultVisible(result)) {
      noticeWarning(
        "Product hidden by filters",
        "Adjust the map filters to make this product visible before opening its popup."
      );
      input.focus();
      openResults();
      return;
    }

    selectedResultId = result.id;
    selectedResultLabel = result.label;
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

    if (!(await navigateToGraphic(view, graphic, { duration: 450 }))) return;
    if (!isCurrentSelection(generation, result.id) || !isResultVisible(result)) return;
    await waitForAnimationFrame();
    if (!isCurrentSelection(generation, result.id)) return;

    const currentResult = productSearchIndex.resolve(result.id);
    if (!currentResult?.graphic) {
      selectedResultId = null;
      noticeWarning(
        "Product no longer available",
        "The selected product was removed before its popup could be opened."
      );
      return;
    }
    if (!isResultVisible(currentResult)) return;
    if (currentResult.graphic !== graphic) {
      // A committed refresh can replace the Graphic without changing Product identity.
      // Navigate once to that replacement, but never publish a superseded selection.
      graphic = currentResult.graphic;
      if (!(await navigateToGraphic(view, graphic, { duration: 0 }))) return;
      if (!isCurrentSelection(generation, result.id)) return;
    }

    const finalResult = productSearchIndex.resolve(result.id);
    if (
      !isCurrentSelection(generation, result.id) ||
      finalResult?.graphic !== graphic ||
      !isResultVisible(finalResult)
    )
      return;
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
      getResultOptions(results)[0]?.focus();
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
    cancelPendingSelection();
    selectedResultId = null;
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
    const visibleMatches = exactMatches.filter(isResultVisible);
    if (exactMatches.length > 0 && visibleMatches.length === 0) {
      noticeWarning(
        "Product hidden by filters",
        "Adjust the map filters to make this product visible before opening its popup."
      );
      input.focus();
      openResults();
      return;
    }
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
    void focusProduct(visibleMatches[0].id);
  }

  function handleInput() {
    cancelPendingSelection();
    selectedResultId = null;
    selectedResultLabel = null;
    openResults();
  }

  function handleInputFocus() {
    cancelPendingSelection();
    openResults();
  }

  input.addEventListener("focus", handleInputFocus);
  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleInputKeydown);
  results.addEventListener("keydown", handleResultsKeydown);
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("focusout", handleFocusOut);

  function handleFocusOut() {
    window.setTimeout(() => {
      if (!form.contains(document.activeElement)) closeResults();
    }, 0);
  }
  const unsubscribeFilterChanges = subscribeFilterChanges?.(() => {
    if (destroyed) return;
    cancelPendingSelection();
    if (isOpen) renderResults();
  });
  const unsubscribe = productSearchIndex.subscribe(() => {
    if (destroyed) return;
    if (selectedResultId && !productSearchIndex.resolve(selectedResultId)) {
      cancelPendingSelection();
      selectedResultId = null;
      // Do not erase typing that happened after the previous Product selection.
      if (input.value === selectedResultLabel) input.value = "";
      selectedResultLabel = null;
    }
    if (isOpen) renderResults();
  });
  return {
    close: closeResults,
    cancelPendingSelection,
    clearSelection() {
      cancelPendingSelection();
      selectedResultId = null;
      input.value = "";
      closeResults();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPendingSelection();
      unsubscribe();
      unsubscribeFilterChanges?.();
      input.removeEventListener("focus", handleInputFocus);
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleInputKeydown);
      results.removeEventListener("keydown", handleResultsKeydown);
      form.removeEventListener("submit", handleSubmit);
      form.removeEventListener("focusout", handleFocusOut);
      host.replaceChildren();
    },
  };
}
async function navigateToGraphic(view, graphic, { duration } = {}) {
  const target = createProductGraphicViewTarget(graphic);
  if (!target) return true;

  try {
    await view.goTo(target, { duration });
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("[Product search] Failed to navigate to product", error);
    }
    return false;
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
  return [...container.querySelectorAll(".main-map-product-search__option")].filter(
    (option) => !option.disabled
  );
}

function createNoopSearch() {
  return {
    close: () => false,
    cancelPendingSelection() {},
    clearSelection() {},
    destroy() {},
  };
}
