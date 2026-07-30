import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";

export async function loadReviewHistories(datasetNames) {
  const names = normalizeDatasetNames(datasetNames);
  const results = await Promise.allSettled(
    names.map(async (datasetName) => {
      const history = await fetchProductHistory(datasetName);

      return {
        datasetName,
        history,
        error: null,
      };
    })
  );

  return results.map((result, index) => {
    const datasetName = names[index];

    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      datasetName,
      history: null,
      error: result.reason instanceof Error ? result.reason.message : "Unknown history error.",
    };
  });
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];

  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}
