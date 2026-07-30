import { loadStatuses } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { fetchProductCatalog } from "../../products/api/productCatalogApi.js";
import { validateProductCatalogSelection } from "../../products/domain/productCatalog.js";
import { hideLoader } from "../../../shared/ui/loader.js";
import {
  addReviewProductItem,
  createReviewProductItems,
  getEnabledReviewDatasetNames,
  normalizeReviewProductItems,
  removeReviewProductItem,
  toggleReviewProductContentType,
  toggleReviewProductItem,
} from "../domain/reviewProductList.js";
import { loadReviewHistories } from "../services/reviewHistoryLoader.js";
import {
  createReviewDocumentTitle,
  getCurrentReviewRoute,
  setReviewRouteUrl,
} from "../routing/reviewRoute.js";
import { renderReviewPage } from "../ui/reviewPage.js";

export async function initReviewPage({ datasetNames } = {}) {
  let productItems = createReviewProductItems(datasetNames);
  let currentProducts = [];
  let productCatalog = createProductCatalogState();
  let loadRequestId = 0;
  let productCatalogRequestId = 0;
  let lookupsLoaded = false;
  let isLoadingReviewProducts = false;
  let reviewError = null;

  const enabledDatasetNames = getEnabledReviewDatasetNames(productItems);

  document.body.classList.add("pc-review-route");
  document.title = createReviewDocumentTitle(enabledDatasetNames);

  const renderCurrentReviewPage = () => {
    renderReviewPage({
      productItems,
      products: currentProducts,
      loading: isLoadingReviewProducts,
      error: reviewError,
      productCatalog,
    });
  };

  const loadProductCatalogForPicker = async () => {
    const requestId = ++productCatalogRequestId;
    productCatalog = createProductCatalogState({ loading: true });
    renderCurrentReviewPage();

    try {
      const products = await fetchProductCatalog();

      if (requestId !== productCatalogRequestId) {
        return;
      }

      productCatalog = createProductCatalogState({ products });
    } catch (error) {
      if (requestId !== productCatalogRequestId) {
        return;
      }

      productCatalog = createProductCatalogState({
        error: error instanceof Error ? error.message : "Unknown product catalog error.",
      });
    }

    renderCurrentReviewPage();
  };

  const loadReviewProductItems = async (nextProductItems, { updateUrl = true } = {}) => {
    const requestId = ++loadRequestId;
    const validatedProductItems = validateReviewProductItems(nextProductItems);
    productItems = validatedProductItems.items;
    notifyRejectedCatalogProducts(validatedProductItems);
    const enabledNextDatasetNames = getEnabledReviewDatasetNames(productItems);

    if (updateUrl) {
      setReviewRouteUrl(enabledNextDatasetNames);
    }

    document.title = createReviewDocumentTitle(enabledNextDatasetNames);

    isLoadingReviewProducts = enabledNextDatasetNames.length > 0;
    reviewError = null;
    renderCurrentReviewPage();

    currentProducts = [];

    if (enabledNextDatasetNames.length === 0) {
      isLoadingReviewProducts = false;
      renderCurrentReviewPage();
      return;
    }

    try {
      await ensureLookupsLoaded();
      const products = await loadReviewHistories(enabledNextDatasetNames);

      if (requestId !== loadRequestId) {
        return;
      }

      currentProducts = products;
      isLoadingReviewProducts = false;
      renderCurrentReviewPage();
    } catch (error) {
      if (requestId !== loadRequestId) {
        return;
      }

      currentProducts = [];
      isLoadingReviewProducts = false;
      reviewError = error instanceof Error ? error.message : "Unknown review error.";
      renderCurrentReviewPage();
      noticeError(
        "Product Review failed",
        error instanceof Error ? error.message : "Unknown review error"
      );
    }
  };

  const addDatasetNamesToReview = async (datasetNamesToAdd, { updateUrl = true } = {}) => {
    const normalizedDatasetNames = normalizeDatasetNames(datasetNamesToAdd);

    if (normalizedDatasetNames.length === 0) {
      return;
    }

    const validation = validateCatalogProductNames(normalizedDatasetNames, {
      excludedProductNames: productItems.map((item) => item.datasetName),
    });

    notifyRejectedCatalogProducts(validation);

    if (validation.valid.length === 0) {
      return;
    }

    let nextProductItems = productItems;

    for (const datasetName of validation.valid) {
      nextProductItems = addReviewProductItem(nextProductItems, datasetName);
    }

    await loadReviewProductItems(nextProductItems, {
      updateUrl,
    });
  };

  const replaceDatasetNamesInReview = async (nextDatasetNames, { updateUrl = true } = {}) => {
    await loadReviewProductItems(createReviewProductItems(nextDatasetNames), {
      updateUrl,
    });
  };

  const loadReviewDatasetNames = async (nextDatasetNames, options = {}) => {
    await replaceDatasetNamesInReview(nextDatasetNames, options);
  };

  const handleProductAdd = async (event) => {
    await addDatasetNamesToReview(event.detail?.datasetNames ?? event.detail?.datasetName ?? [], {
      updateUrl: true,
    });
  };

  const handleProductToggle = async (event) => {
    const itemId = event.detail?.id;

    if (!itemId) {
      return;
    }

    await loadReviewProductItems(
      toggleReviewProductItem(productItems, itemId, event.detail?.enabled),
      {
        updateUrl: true,
      }
    );
  };

  const handleProductRemove = async (event) => {
    const itemId = event.detail?.id;

    if (!itemId) {
      return;
    }

    await loadReviewProductItems(removeReviewProductItem(productItems, itemId), {
      updateUrl: true,
    });
  };

  const handleContentToggle = (event) => {
    const itemId = event.detail?.id;
    const contentType = event.detail?.contentType;

    if (!itemId || !contentType) {
      return;
    }

    productItems = toggleReviewProductContentType(
      productItems,
      itemId,
      contentType,
      event.detail?.enabled
    );
    renderCurrentReviewPage();
  };

  document.addEventListener("pc-review-product-add", handleProductAdd);
  document.addEventListener("pc-review-product-toggle", handleProductToggle);
  document.addEventListener("pc-review-content-toggle", handleContentToggle);
  document.addEventListener("pc-review-product-remove", handleProductRemove);

  await waitForNextPaint();
  hideLoader();

  renderCurrentReviewPage();
  await loadProductCatalogForPicker();
  await loadReviewProductItems(productItems, { updateUrl: false });

  const handlePopState = async () => {
    const route = getCurrentReviewRoute();
    await loadReviewDatasetNames(route.datasetNames, { updateUrl: false });
  };

  window.addEventListener("popstate", handlePopState);

  return {
    get products() {
      return currentProducts;
    },
    loadReviewDatasetNames,
    destroy() {
      loadRequestId += 1;
      productCatalogRequestId += 1;
      document.removeEventListener("pc-review-product-add", handleProductAdd);
      document.removeEventListener("pc-review-product-toggle", handleProductToggle);
      document.removeEventListener("pc-review-content-toggle", handleContentToggle);
      document.removeEventListener("pc-review-product-remove", handleProductRemove);
      window.removeEventListener("popstate", handlePopState);
      document.body.classList.remove("pc-review-route");
    },
  };

  function validateReviewProductItems(nextProductItems) {
    const normalizedItems = normalizeReviewProductItems(nextProductItems);

    if (!canValidateCatalog(productCatalog)) {
      return {
        items: normalizedItems,
        valid: normalizedItems.map((item) => item.datasetName),
        unknown: [],
        alreadySelected: [],
      };
    }

    const validation = validateProductCatalogSelection(
      productCatalog.products,
      normalizedItems.map((item) => item.datasetName)
    );
    const validKeys = new Set(validation.valid.map((name) => name.toUpperCase()));

    return {
      ...validation,
      items: normalizedItems.filter((item) => validKeys.has(item.datasetName.toUpperCase())),
    };
  }

  function validateCatalogProductNames(productNames, { excludedProductNames = [] } = {}) {
    if (!canValidateCatalog(productCatalog)) {
      return {
        valid: normalizeDatasetNames(productNames),
        unknown: [],
        alreadySelected: [],
      };
    }

    return validateProductCatalogSelection(productCatalog.products, productNames, {
      excludedProductNames,
    });
  }

  function notifyRejectedCatalogProducts({ unknown = [], alreadySelected = [] } = {}) {
    if (unknown.length > 0) {
      noticeError(
        "Product not found",
        `The product catalog does not contain: ${unknown.join(", ")}.`
      );
    }

    if (alreadySelected.length > 0) {
      noticeError(
        "Product already added",
        `${alreadySelected.join(", ")} ${
          alreadySelected.length === 1 ? "is" : "are"
        } already in Product Review.`
      );
    }
  }

  async function ensureLookupsLoaded() {
    if (lookupsLoaded) {
      return;
    }

    await loadLookupsSafely();
    lookupsLoaded = true;
  }
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

async function loadLookupsSafely() {
  const results = await Promise.allSettled([loadStatuses()]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[Review] Lookup data failed to load", result.reason);
    }
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function createProductCatalogState({ products = [], loading = false, error = null } = {}) {
  return {
    products,
    loading,
    error,
  };
}

function canValidateCatalog(productCatalog) {
  return (
    !productCatalog.loading &&
    !productCatalog.error &&
    Array.isArray(productCatalog.products) &&
    productCatalog.products.length > 0
  );
}
