import { loadStatuses } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { fetchProductCatalog } from "../../products/api/productCatalogApi.js";
import { validateProductCatalogSelection } from "../../products/domain/productCatalog.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
import {
  getProductOperationState,
  onProductOperationStateChanged,
} from "../../products/state/productOperationState.js";
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
import { captureReviewProductListInteraction } from "../ui/reviewProductListInteraction.js";

export async function initReviewPage({ datasetNames } = {}) {
  let productItems = createReviewProductItems(datasetNames);
  let currentProducts = [];
  let productCatalog = createProductCatalogState();
  let loadRequestId = 0;
  let productCatalogRequestId = 0;
  let lookupsLoaded = false;
  let isLoadingReviewProducts = false;
  let reviewError = null;
  let freshnessMonitor = null;
  let unsubscribeFromProductOperationState = null;
  let activeWorkspaceLoadRequestId = null;
  let targetedRefreshRequestId = 0;

  const enabledDatasetNames = getEnabledReviewDatasetNames(productItems);

  document.body.classList.add("pc-review-route");
  document.title = createReviewDocumentTitle(enabledDatasetNames);

  const renderCurrentReviewPage = ({ productListInteraction = null } = {}) => {
    renderReviewPage({
      productItems,
      products: currentProducts,
      loading: isLoadingReviewProducts,
      error: reviewError,
      productCatalog,
      productListInteraction,
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
    activeWorkspaceLoadRequestId = requestId;
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
      await freshnessMonitor?.prime([]);
      if (activeWorkspaceLoadRequestId === requestId) {
        activeWorkspaceLoadRequestId = null;
      }
      if (!updateUrl) setReviewRouteUrl([], { replace: true });
      isLoadingReviewProducts = false;
      renderCurrentReviewPage();
      return;
    }

    await freshnessMonitor?.prime(enabledNextDatasetNames);
    if (requestId !== loadRequestId) {
      return;
    }

    try {
      await ensureLookupsLoaded();
      const products = await loadReviewHistories(enabledNextDatasetNames);

      if (requestId !== loadRequestId) {
        return;
      }

      // The request generation has been checked, so a stale load cannot rewrite a newer URL.
      if (!updateUrl) setReviewRouteUrl(enabledNextDatasetNames, { replace: true });
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
    } finally {
      if (activeWorkspaceLoadRequestId === requestId) {
        activeWorkspaceLoadRequestId = null;
      }
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

  const refreshReviewProducts = async (datasetNamesToRefresh) => {
    if (activeWorkspaceLoadRequestId !== null) {
      return false;
    }

    const enabledNames = getEnabledReviewDatasetNames(productItems);
    const enabledKeys = new Set(enabledNames.map(normalizeDatasetKey));
    const refreshNames = normalizeDatasetNames(datasetNamesToRefresh).filter((datasetName) =>
      enabledKeys.has(normalizeDatasetKey(datasetName))
    );

    if (refreshNames.length === 0) {
      return true;
    }

    const refreshRequestId = ++targetedRefreshRequestId;
    const workspaceLoadRequestId = loadRequestId;
    try {
      await ensureLookupsLoaded();
      const refreshedProducts = await loadReviewHistories(refreshNames);
      if (
        refreshRequestId !== targetedRefreshRequestId ||
        workspaceLoadRequestId !== loadRequestId ||
        activeWorkspaceLoadRequestId !== null
      ) {
        return false;
      }

      currentProducts = mergeProductsByDatasetName(
        currentProducts,
        refreshedProducts,
        enabledNames
      );
      reviewError = null;
      renderCurrentReviewPage();
      return true;
    } catch (error) {
      if (
        refreshRequestId !== targetedRefreshRequestId ||
        workspaceLoadRequestId !== loadRequestId
      ) {
        return false;
      }

      console.warn("[Review] Automatic workspace refresh failed", error);
      return false;
    }
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

    const productListInteraction = captureReviewProductListInteraction();
    productItems = toggleReviewProductContentType(
      productItems,
      itemId,
      contentType,
      event.detail?.enabled
    );
    renderCurrentReviewPage({ productListInteraction });
  };

  const handleReviewRefresh = async () => {
    await loadReviewProductItems(productItems, { updateUrl: false });
  };

  freshnessMonitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => getEnabledReviewDatasetNames(productItems),
    onChanged: (changedDatasetNames) => refreshReviewProducts(changedDatasetNames),
  });
  unsubscribeFromProductOperationState = onProductOperationStateChanged(({ datasetName } = {}) => {
    if (!datasetName || getProductOperationState(datasetName).running) {
      return;
    }

    const enabledKeys = new Set(
      getEnabledReviewDatasetNames(productItems).map(normalizeDatasetKey)
    );
    if (enabledKeys.has(normalizeDatasetKey(datasetName))) {
      void freshnessMonitor?.check();
    }
  });

  document.addEventListener("pc-review-product-add", handleProductAdd);
  document.addEventListener("pc-review-product-toggle", handleProductToggle);
  document.addEventListener("pc-review-content-toggle", handleContentToggle);
  document.addEventListener("pc-review-product-remove", handleProductRemove);
  document.addEventListener("pc-review-refresh", handleReviewRefresh);

  await waitForNextPaint();
  hideLoader();

  renderCurrentReviewPage();
  await loadProductCatalogForPicker();
  await loadReviewProductItems(productItems, { updateUrl: false });
  freshnessMonitor.start();

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
      targetedRefreshRequestId += 1;
      activeWorkspaceLoadRequestId = null;
      productCatalogRequestId += 1;
      document.removeEventListener("pc-review-product-add", handleProductAdd);
      document.removeEventListener("pc-review-product-toggle", handleProductToggle);
      document.removeEventListener("pc-review-content-toggle", handleContentToggle);
      document.removeEventListener("pc-review-product-remove", handleProductRemove);
      document.removeEventListener("pc-review-refresh", handleReviewRefresh);
      window.removeEventListener("popstate", handlePopState);
      unsubscribeFromProductOperationState?.();
      unsubscribeFromProductOperationState = null;
      freshnessMonitor?.destroy();
      freshnessMonitor = null;
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

function normalizeDatasetKey(datasetName) {
  return String(datasetName ?? "")
    .trim()
    .toUpperCase();
}

function mergeProductsByDatasetName(currentProducts, refreshedProducts, enabledDatasetNames) {
  const currentByDatasetName = new Map(
    currentProducts.map((product) => [normalizeDatasetKey(product?.datasetName), product])
  );

  for (const product of refreshedProducts) {
    const key = normalizeDatasetKey(product?.datasetName);
    if (key) {
      currentByDatasetName.set(key, product);
    }
  }

  return enabledDatasetNames
    .map((datasetName) => currentByDatasetName.get(normalizeDatasetKey(datasetName)))
    .filter(Boolean);
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
