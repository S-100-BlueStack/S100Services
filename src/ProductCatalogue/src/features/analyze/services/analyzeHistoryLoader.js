import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";

export async function loadAnalyzeProductHistories(
  products,
  { fetchHistory = fetchProductHistory } = {}
) {
  const normalizedProducts = Array.isArray(products) ? products : [];
  const results = await Promise.allSettled(
    normalizedProducts.map(async (product) => {
      if (product?.workspaceLoadState !== "loaded" || !product?.productContext) {
        throw new Error(
          product?.loadError ??
            `Product ${product?.datasetName ?? "Unknown"} has no resolved Product context for History.`
        );
      }

      const history = await fetchHistory(product.datasetName, {
        productContext: product.productContext,
      });

      return {
        ...product,
        history,
        historyError: null,
      };
    })
  );

  return results.map((result, index) => {
    const product = normalizedProducts[index];
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      ...product,
      history: null,
      historyError:
        result.reason instanceof Error ? result.reason.message : "Unknown history error.",
    };
  });
}
