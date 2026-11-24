import {
  captureWorkspaceTransferFocus,
  restoreWorkspaceTransferFocus,
} from "../../../shared/ui/workspaceTransferLink.js";
import {
  getEnabledReviewDatasetNames,
  normalizeReviewProductItems,
} from "../domain/reviewProductList.js";
import { createReviewBoard } from "./reviewBoard.js";
import { restoreReviewProductListInteraction } from "./reviewProductListInteraction.js";
import { createReviewSidebar } from "./reviewSidebar.js";
import {
  captureReviewPickerInteraction,
  restoreReviewPickerInteraction,
} from "./reviewPickerInteraction.js";
import { restoreReviewWorkspaceContentInteraction } from "./reviewWorkspaceContentInteraction.js";

export function renderReviewPage({
  productItems,
  products = [],
  loading = false,
  error = null,
  productCatalog = createEmptyProductCatalogState(),
  productListInteraction = null,
  workspaceContentInteraction = null,
  comparison = null,
}) {
  const page = getOrCreateReviewPage();
  const previousBoard = page.querySelector(".pc-review-board");
  const activeElement = document.activeElement;
  const pickerInteraction = captureReviewPickerInteraction(page, activeElement);
  const transferFocus = captureWorkspaceTransferFocus(page, ".pc-review-product-list__items");
  const previousScrollLeft =
    previousBoard?.querySelector(".pc-review-board__columns")?.scrollLeft ?? 0;
  const retainedScroll = [
    ...(previousBoard?.querySelectorAll(
      ".pc-review-column__content, .pc-review-content-card__body--scrollable"
    ) ?? []),
  ].map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
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
  // Reparenting a retained column can reset native scroll offsets in Chromium.
  // Restore only surviving nodes, never positions from a replaced Product payload.
  for (const { element, top, left } of retainedScroll) {
    if (!page.contains(element)) continue;
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  comparison?.connect(page.querySelector(".pc-review-board"));
  // A retained column keeps its actual controls; restore only a surviving node.
  if (activeElement && page.contains(activeElement)) activeElement.focus?.({ preventScroll: true });
  // Selection rerenders the sidebar before the picker handler has completed.
  // Keep keyboard entry on the newly rendered input instead of the removed form.
  restoreReviewPickerInteraction(page, pickerInteraction);
  restoreReviewProductListInteraction(productListInteraction, { page });
  restoreReviewWorkspaceContentInteraction(workspaceContentInteraction, { page });
  restoreWorkspaceTransferFocus(page, ".pc-review-product-list__items", transferFocus);
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
