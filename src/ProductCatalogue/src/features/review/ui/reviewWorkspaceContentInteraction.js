const PRODUCT_LIST_SELECTOR = ".pc-review-product-list__items";
const WORKSPACE_CONTENT_TOGGLE_SELECTOR = "[data-review-workspace-content-type]";

export function captureReviewWorkspaceContentInteraction({
  page = document.getElementById("product-review-page"),
  activeElement = document.activeElement,
} = {}) {
  const list = page?.querySelector(PRODUCT_LIST_SELECTOR);
  const contentType = activeElement?.dataset?.reviewWorkspaceContentType ?? "";

  return {
    scrollTop: list?.scrollTop ?? 0,
    contentType,
  };
}

export function restoreReviewWorkspaceContentInteraction(
  interaction,
  { page = document.getElementById("product-review-page") } = {}
) {
  if (!interaction) {
    return;
  }

  const list = page?.querySelector(PRODUCT_LIST_SELECTOR);

  if (list) {
    list.scrollTop = interaction.scrollTop;
  }

  if (!interaction.contentType) {
    return;
  }

  const toggle = [...page.querySelectorAll(WORKSPACE_CONTENT_TOGGLE_SELECTOR)].find(
    (candidate) => candidate.dataset.reviewWorkspaceContentType === interaction.contentType
  );

  toggle?.focus({ preventScroll: true });
}
