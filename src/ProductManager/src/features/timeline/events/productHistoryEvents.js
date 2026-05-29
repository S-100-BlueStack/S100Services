export const PRODUCT_HISTORY_OPEN_EVENT = "pm-product-history-open";

export function openProductHistoryPanel(datasetName) {
  document.dispatchEvent(
    new CustomEvent(PRODUCT_HISTORY_OPEN_EVENT, {
      detail: {
        datasetName,
      },
    })
  );
}

export function onProductHistoryOpen(callback) {
  const handler = (event) => {
    callback(event.detail ?? {});
  };

  document.addEventListener(PRODUCT_HISTORY_OPEN_EVENT, handler);

  return {
    remove() {
      document.removeEventListener(PRODUCT_HISTORY_OPEN_EVENT, handler);
    },
  };
}
