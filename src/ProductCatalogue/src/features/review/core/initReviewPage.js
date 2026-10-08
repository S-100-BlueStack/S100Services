import { resolveReviewComposition } from "../services/reviewWorkUnitResolver.js";
import { getReviewResolutionAliases } from "../domain/reviewWorkUnits.js";
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
  const initialProductItems = createReviewProductItems(datasetNames);
  let productItems = [];
  let compositionResolutions = [];
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
      productCatalog: {
        ...productCatalog,
        excludedProductNames: getSelectedReviewProductNames(productItems),
      },
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
    resolveItems: (items, options) => resolveReviewComposition(items, options),
    onComposition: (
      items,
      { updateUrl = true, inheritIntent = false, resetIntent = false },
      resolutions
    ) => {
      if (resetIntent) workspaceContentIntent = createReviewWorkspaceContentIntent();
      const previousItems = productItems;
      productItems = items.map((item) => {
        const resolution = resolutions.find(
          (value) =>
            normalizeDatasetKey(value.product?.datasetName ?? value.requestedDatasetName) ===
            item.id
        );
        const aliases = new Set(resolution ? getReviewResolutionAliases(resolution) : [item.id]);
        const previous = resetIntent ? null : previousItems.find((value) => aliases.has(value.id));
        // Content edits performed while canonicalization awaited remain authoritative.
        return {
          ...item,
          ...(inheritIntent && previous ? { enabled: previous.enabled } : {}),
          contentTypes:
            previous?.contentTypes ??
            (inheritIntent ? { ...workspaceContentIntent } : item.contentTypes),
        };
      });
      compositionResolutions = resolutions;
      const names = getEnabledReviewDatasetNames(productItems);
      setReviewRouteUrl(names, { replace: !updateUrl });
      document.title = createReviewDocumentTitle(names);
      freshnessMonitor?.retain();
      return productItems;
    },
    loadProduct: async (datasetName, { resolution } = {}) => {
      const [product] = await loadReviewHistories([datasetName], {
        ...(resolution ? { resolutions: [resolution] } : {}),
      });
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
      // Capture at publication time, never carry a snapshot across an await.
      renderCurrentReviewPage({
        productListInteraction: captureReviewProductListInteraction(),
        workspaceContentInteraction: captureReviewWorkspaceContentInteraction(),
      });
    },
  });

  const loadReviewProductItems = async (
    nextProductItems,
    { updateUrl = true, full = false, inheritIntent = false, resetIntent = false } = {}
  ) => {
    if (disposed) return;
    const validatedProductItems = validateReviewProductItems(nextProductItems);
    notifyRejectedCatalogProducts(validatedProductItems);
    const fullLoad = full || !hasLoadedComposition;
    hasLoadedComposition = true;
    await productSession.reconcile(validatedProductItems.items, {
      full: fullLoad,
      updateUrl,
      inheritIntent,
      resetIntent,
    });
  };

  const addDatasetNamesToReview = async (datasetNamesToAdd, { updateUrl = true } = {}) => {
    const normalizedDatasetNames = normalizeDatasetNames(datasetNamesToAdd);

    if (normalizedDatasetNames.length === 0) {
      return;
    }

    const validation = validateCatalogProductNames(normalizedDatasetNames, {
      excludedProductNames: getSelectedReviewProductNames(productSession.getItems()),
    });

    notifyRejectedCatalogProducts(validation);

    if (validation.valid.length === 0) {
      return;
    }

    let nextProductItems = productSession.getItems();

    for (const datasetName of validation.valid) {
      nextProductItems = addReviewProductItem(nextProductItems, datasetName, {
        contentTypeIntent: workspaceContentIntent,
      });
    }

    await loadReviewProductItems(nextProductItems, {
      updateUrl,
      inheritIntent: true,
    });
  };

  const replaceDatasetNamesInReview = async (nextDatasetNames, { updateUrl = true } = {}) => {
    await loadReviewProductItems(createReviewProductItems(nextDatasetNames), {
      full: true,
      resetIntent: true,
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
      toggleReviewProductItem(productSession.getItems(), itemId, event.detail?.enabled),
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

    await loadReviewProductItems(removeReviewProductItem(productSession.getItems(), itemId), {
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
    await loadReviewProductItems(productSession.getItems(), { updateUrl: false, full: true });
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
    const related = compositionResolutions.some(
      (resolution) =>
        enabledKeys.has(
          normalizeDatasetKey(resolution.product?.datasetName ?? resolution.requestedDatasetName)
        ) && getReviewResolutionAliases(resolution).includes(normalizeDatasetKey(datasetName))
    );
    if (related || enabledKeys.has(normalizeDatasetKey(datasetName))) {
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
    await loadReviewProductItems(initialProductItems, { updateUrl: false, full: true });
  }
  if (!disposed) freshnessMonitor.start();

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
      normalizedItems
        .filter((item) => !productItems.some((previous) => previous.id === item.id))
        .map((item) => item.datasetName)
    );
    const validKeys = new Set([
      ...validation.valid.map((name) => name.toUpperCase()),
      ...productItems.map((item) => item.id),
    ]);

    return {
      ...validation,
      items: normalizedItems.filter((item) => validKeys.has(item.datasetName.toUpperCase())),
    };
  }

  function getSelectedReviewProductNames(items) {
    const keys = new Set(items.map((item) => item.id));
    for (const resolution of compositionResolutions) {
      const aliases = getReviewResolutionAliases(resolution);
      if (aliases.some((alias) => keys.has(alias))) {
        for (const alias of aliases) keys.add(alias);
      }
    }
    return [...keys];
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
