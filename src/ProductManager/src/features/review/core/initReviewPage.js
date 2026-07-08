import { loadStatuses } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
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
import { initReviewSessionChannel } from "../session/reviewSessionChannel.js";
import { renderReviewPage } from "../ui/reviewPage.js";

export async function initReviewPage({ datasetNames } = {}) {
  let productItems = createReviewProductItems(datasetNames);
  let currentProducts = [];
  let loadRequestId = 0;
  let lookupsLoaded = false;
  let reviewSessionChannel = null;

  const enabledDatasetNames = getEnabledReviewDatasetNames(productItems);

  document.body.classList.add("pm-review-route");
  document.title = createReviewDocumentTitle(enabledDatasetNames);

  const loadReviewProductItems = async (nextProductItems, { updateUrl = true } = {}) => {
    const requestId = ++loadRequestId;

    productItems = normalizeReviewProductItems(nextProductItems);

    const enabledNextDatasetNames = getEnabledReviewDatasetNames(productItems);

    if (updateUrl) {
      setReviewRouteUrl(enabledNextDatasetNames);
    }

    document.title = createReviewDocumentTitle(enabledNextDatasetNames);
    reviewSessionChannel?.refresh?.();

    renderReviewPage({
      productItems,
      products: currentProducts,
      loading: enabledNextDatasetNames.length > 0,
    });

    currentProducts = [];

    if (enabledNextDatasetNames.length === 0) {
      renderReviewPage({
        productItems,
        products: [],
        loading: false,
      });
      reviewSessionChannel?.refresh?.();
      return;
    }

    try {
      await ensureLookupsLoaded();

      const products = await loadReviewHistories(enabledNextDatasetNames);

      if (requestId !== loadRequestId) {
        return;
      }

      currentProducts = products;

      renderReviewPage({
        productItems,
        products,
        loading: false,
      });
      reviewSessionChannel?.refresh?.();
    } catch (error) {
      if (requestId !== loadRequestId) {
        return;
      }

      renderReviewPage({
        productItems,
        products: [],
        loading: false,
        error: error instanceof Error ? error.message : "Unknown review error.",
      });

      noticeError(
        "Product Review failed",
        error instanceof Error ? error.message : "Unknown review error"
      );
      reviewSessionChannel?.refresh?.();
    }
  };

  const addDatasetNamesToReview = async (datasetNamesToAdd, { updateUrl = true } = {}) => {
    const datasetNames = normalizeDatasetNames(datasetNamesToAdd);

    if (datasetNames.length === 0) {
      return;
    }

    let nextProductItems = productItems;

    for (const datasetName of datasetNames) {
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

    renderReviewPage({
      productItems,
      products: currentProducts,
      loading: false,
    });
    reviewSessionChannel?.refresh?.();
  };

  document.addEventListener("pm-review-product-add", handleProductAdd);
  document.addEventListener("pm-review-product-toggle", handleProductToggle);
  document.addEventListener("pm-review-content-toggle", handleContentToggle);
  document.addEventListener("pm-review-product-remove", handleProductRemove);

  reviewSessionChannel = initReviewSessionChannel({
    getDatasetNames: () => getEnabledReviewDatasetNames(productItems),
    onAddProducts: async ({ datasetNames: broadcastDatasetNames }) => {
      await addDatasetNamesToReview(broadcastDatasetNames, {
        updateUrl: true,
      });
    },
    onReplaceProducts: async ({ datasetNames: broadcastDatasetNames }) => {
      await replaceDatasetNamesInReview(broadcastDatasetNames, {
        updateUrl: true,
      });
    },
  });

  await waitForNextPaint();
  hideLoader();

  renderReviewPage({
    productItems,
    products: [],
    loading: false,
  });

  await loadReviewProductItems(productItems, {
    updateUrl: false,
  });

  const handlePopState = async () => {
    const route = getCurrentReviewRoute();

    await loadReviewDatasetNames(route.datasetNames, {
      updateUrl: false,
    });
  };

  window.addEventListener("popstate", handlePopState);

  return {
    get products() {
      return currentProducts;
    },
    loadReviewDatasetNames,
    destroy() {
      loadRequestId += 1;
      document.removeEventListener("pm-review-product-add", handleProductAdd);
      document.removeEventListener("pm-review-product-toggle", handleProductToggle);
      document.removeEventListener("pm-review-content-toggle", handleContentToggle);
      document.removeEventListener("pm-review-product-remove", handleProductRemove);
      window.removeEventListener("popstate", handlePopState);
      reviewSessionChannel?.destroy?.();
      reviewSessionChannel = null;
      document.body.classList.remove("pm-review-route");
    },
  };

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
