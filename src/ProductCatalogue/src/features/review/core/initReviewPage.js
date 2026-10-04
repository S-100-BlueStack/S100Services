import { createReviewProductSession } from "./reviewProductSession.js";
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
  createReviewWorkspaceContentIntent,
  createReviewProductItems,
  getEnabledReviewDatasetNames,
  normalizeReviewProductItems,
  removeReviewProductItem,
  toggleReviewProductContentType,
  toggleAllReviewProductContentTypes,
  toggleReviewProductItem,
  updateReviewWorkspaceContentIntent,
} from "../domain/reviewProductList.js";
import { loadReviewHistories } from "../services/reviewHistoryLoader.js";
import {
  createReviewDocumentTitle,
  getCurrentReviewRoute,
  setReviewRouteUrl,
} from "../routing/reviewRoute.js";
import { renderReviewPage } from "../ui/reviewPage.js";
import { captureReviewProductListInteraction } from "../ui/reviewProductListInteraction.js";
import { captureReviewWorkspaceContentInteraction } from "../ui/reviewWorkspaceContentInteraction.js";

export async function initReviewPage({ datasetNames } = {}) {
  let productItems = createReviewProductItems(datasetNames);
  let workspaceContentIntent = createReviewWorkspaceContentIntent();
  let currentProducts = [];
  let productCatalog = createProductCatalogState();
  let productCatalogRequestId = 0;
  let lookupsPromise = null;
  let isLoadingReviewProducts = false;
  let freshnessMonitor = null;
  let unsubscribeFromProductOperationState = null;
  let disposed = false;
  let hasLoadedComposition = false;

  const enabledDatasetNames = getEnabledReviewDatasetNames(productItems);

  document.body.classList.add("pc-review-route");
  document.title = createReviewDocumentTitle(enabledDatasetNames);

  const renderCurrentReviewPage = ({
    productListInteraction = null,
    workspaceContentInteraction = null,
  } = {}) => {
    renderReviewPage({
      productItems,
      products: currentProducts,
      loading: isLoadingReviewProducts,
      productCatalog,
      productListInteraction,
      workspaceContentInteraction,
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

  const productSession = createReviewProductSession({
    loadProduct: async (datasetName) => {
      const [product] = await loadReviewHistories([datasetName]);
      return product;
    },
    prepare: async (datasetNames, { full }) => {
      await Promise.all([
        ensureLookupsLoaded(),
        full
          ? freshnessMonitor?.prime(datasetNames)
          : freshnessMonitor?.primeAdditional(datasetNames),
      ]);
    },
    onChange: ({ products, loading }) => {
      currentProducts = products;
      isLoadingReviewProducts = loading;
      renderCurrentReviewPage();
    },
  });

  const loadReviewProductItems = async (
    nextProductItems,
    { updateUrl = true, full = false } = {}
  ) => {
    if (disposed) return;
    const validatedProductItems = validateReviewProductItems(nextProductItems);
    productItems = validatedProductItems.items;
    notifyRejectedCatalogProducts(validatedProductItems);
    const enabledNextDatasetNames = getEnabledReviewDatasetNames(productItems);

    // Route publication belongs to the synchronous authoritative composition edit,
    // never to an eventual Product completion from an older composition.
    setReviewRouteUrl(enabledNextDatasetNames, { replace: !updateUrl });
    document.title = createReviewDocumentTitle(enabledNextDatasetNames);
    const fullLoad = full || !hasLoadedComposition;
    hasLoadedComposition = true;
    freshnessMonitor?.retain();
    await productSession.reconcile(productItems, { full: fullLoad });
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
      nextProductItems = addReviewProductItem(nextProductItems, datasetName, {
        contentTypeIntent: workspaceContentIntent,
      });
    }

    await loadReviewProductItems(nextProductItems, {
      updateUrl,
    });
  };

  const replaceDatasetNamesInReview = async (nextDatasetNames, { updateUrl = true } = {}) => {
    workspaceContentIntent = createReviewWorkspaceContentIntent();
    await loadReviewProductItems(createReviewProductItems(nextDatasetNames), {
      full: true,
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

    const productListInteraction = captureReviewProductListInteraction();
    productItems = toggleReviewProductContentType(
      productItems,
      itemId,
      contentType,
      event.detail?.enabled
    );
    renderCurrentReviewPage({ productListInteraction });
  };

  const handleWorkspaceContentToggle = (event) => {
    const contentType = event.detail?.contentType;

    if (!contentType) {
      return;
    }

    const workspaceContentInteraction = captureReviewWorkspaceContentInteraction();
    workspaceContentIntent = updateReviewWorkspaceContentIntent(
      workspaceContentIntent,
      contentType,
      event.detail?.enabled
    );
    productItems = toggleAllReviewProductContentTypes(
      productItems,
      contentType,
      event.detail?.enabled
    );
    renderCurrentReviewPage({ workspaceContentInteraction });
  };

  const handleReviewRefresh = async () => {
    await loadReviewProductItems(productItems, { updateUrl: false, full: true });
  };

  freshnessMonitor = createWorkspaceFreshnessMonitor({
    getDatasetNames: () => getEnabledReviewDatasetNames(productItems),
    getRetainedDatasetNames: () => productItems.map((item) => item.datasetName),
    onChanged: (changedDatasetNames) => productSession.refresh(changedDatasetNames),
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
  document.addEventListener("pc-review-content-bulk-toggle", handleWorkspaceContentToggle);
  document.addEventListener("pc-review-product-remove", handleProductRemove);
  document.addEventListener("pc-review-refresh", handleReviewRefresh);

  const handlePopState = async () => {
    const route = getCurrentReviewRoute();
    await loadReviewDatasetNames(route.datasetNames, { updateUrl: false });
  };

  window.addEventListener("popstate", handlePopState);

  await waitForNextPaint();
  hideLoader();

  renderCurrentReviewPage();
  await loadProductCatalogForPicker();
  if (!hasLoadedComposition) {
    await loadReviewProductItems(productItems, { updateUrl: false, full: true });
  }
  freshnessMonitor.start();

  return {
    get products() {
      return currentProducts;
    },
    loadReviewDatasetNames,
    destroy() {
      disposed = true;
      productSession.destroy();
      productCatalogRequestId += 1;
      document.removeEventListener("pc-review-product-add", handleProductAdd);
      document.removeEventListener("pc-review-product-toggle", handleProductToggle);
      document.removeEventListener("pc-review-content-toggle", handleContentToggle);
      document.removeEventListener("pc-review-content-bulk-toggle", handleWorkspaceContentToggle);
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

  function ensureLookupsLoaded() {
    lookupsPromise ??= loadLookupsSafely();
    return lookupsPromise;
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
