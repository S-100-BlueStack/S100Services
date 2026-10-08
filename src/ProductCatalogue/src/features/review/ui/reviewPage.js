import {
  getEnabledReviewDatasetNames,
  normalizeReviewProductItems,
} from "../domain/reviewProductList.js";
import { createReviewBoard } from "./reviewBoard.js";
import { restoreReviewProductListInteraction } from "./reviewProductListInteraction.js";
import { createReviewSidebar } from "./reviewSidebar.js";
import { restoreReviewWorkspaceContentInteraction } from "./reviewWorkspaceContentInteraction.js";

export function renderReviewPage({
  productItems,
  products = [],
  loading = false,
  error = null,
  productCatalog = createEmptyProductCatalogState(),
  productListInteraction = null,
  workspaceContentInteraction = null,
}) {
  const page = getOrCreateReviewPage();
  const previousBoard = page.querySelector(".pc-review-board");
  const activeElement = document.activeElement;
  const previousScrollLeft =
    previousBoard?.querySelector(".pc-review-board__columns")?.scrollLeft ?? 0;
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
      previousBoard,
    })
  );
  const columns = page.querySelector(".pc-review-board__columns");
  if (columns) columns.scrollLeft = previousScrollLeft;
  // A retained column keeps its actual controls; restore only a surviving node.
  if (activeElement && page.contains(activeElement)) activeElement.focus?.({ preventScroll: true });
  restoreReviewProductListInteraction(productListInteraction, { page });
  restoreReviewWorkspaceContentInteraction(workspaceContentInteraction, { page });
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
  page.className = "pc-review-page";
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
