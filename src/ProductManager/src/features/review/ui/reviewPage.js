import {
  getEnabledReviewDatasetNames,
  normalizeReviewProductItems,
} from "../domain/reviewProductList.js";
import { createReviewBoard } from "./reviewBoard.js";
import { createReviewSidebar } from "./reviewSidebar.js";

export function renderReviewPage({
  productItems,
  products = [],
  loading = false,
  error = null,
  productCatalog = createEmptyProductCatalogState(),
}) {
  const page = getOrCreateReviewPage();
  const normalizedProductItems = normalizeReviewProductItems(productItems);
  const enabledDatasetNames = getEnabledReviewDatasetNames(normalizedProductItems);

  page.replaceChildren(
    createReviewSidebar({
      productItems: normalizedProductItems,
      loading,
      productCatalog,
    }),
    createReviewBoard({
      productItems: normalizedProductItems,
      enabledDatasetNames,
      products,
      loading,
      error,
    })
  );
}

function getOrCreateReviewPage() {
  const existingPage = document.getElementById("product-review-page");

  if (existingPage) {
    return existingPage;
  }

  const shell = document.querySelector("calcite-shell");

  if (!shell) {
    throw new Error("Unable to create Product Review page because calcite-shell was not found.");
  }

  const page = document.createElement("main");
  page.id = "product-review-page";
  page.className = "pm-review-page";
  page.setAttribute("aria-label", "Product Review");
  shell.appendChild(page);

  return page;
}

function createEmptyProductCatalogState() {
  return {
    products: [],
    loading: false,
    error: null,
  };
}
