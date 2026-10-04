const PRODUCT_LIST_SELECTOR = ".pc-review-product-list__items";
const CONTENT_TOGGLE_SELECTOR = "[data-review-product-id][data-review-content-type]";

export function captureReviewProductListInteraction({
  page = document.getElementById("product-review-page"),
  activeElement = document.activeElement,
} = {}) {
  const list = page?.querySelector(PRODUCT_LIST_SELECTOR);

  if (!list) {
    return null;
  }

  const focusedToggle = list.contains(activeElement) ? activeElement : null;
  const productId = focusedToggle?.dataset?.reviewProductId ?? "";
  const contentType = focusedToggle?.dataset?.reviewContentType ?? "";

  return {
    scrollTop: list.scrollTop,
    focus:
      productId && contentType
        ? {
            productId,
            contentType,
          }
        : null,
  };
}

export function restoreReviewProductListInteraction(
  interaction,
  { page = document.getElementById("product-review-page") } = {}
) {
  if (!interaction) {
    return;
  }

  const list = page?.querySelector(PRODUCT_LIST_SELECTOR);

  if (!list) {
    return;
  }

  list.scrollTop = interaction.scrollTop;

  if (!interaction.focus) {
    return;
  }

  const toggle = [...list.querySelectorAll(CONTENT_TOGGLE_SELECTOR)].find(
    (candidate) =>
      candidate.dataset.reviewProductId === interaction.focus.productId &&
      candidate.dataset.reviewContentType === interaction.focus.contentType
  );

  toggle?.focus({ preventScroll: true });
}
