import {
  reconcileProductCollectionSourceProducts,
  removeProductCollectionProductsBySource,
} from "../../productCollection/state/productCollectionStore.js";

export function createDataSourceProductStateCoordinator({ lifecycle } = {}) {
  if (!lifecycle?.subscribe) {
    return { destroy() {} };
  }

  const unsubscribeActivated = lifecycle.subscribe("activated", reconcileCommittedSource);
  const unsubscribeRefreshed = lifecycle.subscribe("refreshed", reconcileCommittedSource);
  const unsubscribeDeactivating = lifecycle.subscribe("deactivating", ({ sourceId, reason }) => {
    if (reason === "activation-failed") {
      return;
    }

    removeProductCollectionProductsBySource(sourceId);
  });

  function reconcileCommittedSource({ sourceId, layers }) {
    reconcileProductCollectionSourceProducts(sourceId, collectCommittedProducts(sourceId, layers));
  }

  return {
    destroy() {
      unsubscribeActivated();
      unsubscribeRefreshed();
      unsubscribeDeactivating();
    },
  };
}

function collectCommittedProducts(sourceId, layers) {
  const products = [];

  for (const layer of Array.isArray(layers) ? layers : []) {
    for (const graphic of getLayerGraphics(layer)) {
      const attributes = graphic?.attributes ?? graphic?.properties ?? null;
      if (!attributes || attributes.sourceId !== sourceId || !attributes.productKey) {
        continue;
      }

      products.push(attributes);
    }
  }

  return products;
}

function getLayerGraphics(layer) {
  if (Array.isArray(layer?.graphics)) {
    return layer.graphics;
  }
  if (typeof layer?.graphics?.toArray === "function") {
    return layer.graphics.toArray();
  }
  if (Array.isArray(layer?.data?.features)) {
    return layer.data.features;
  }

  return [];
}
