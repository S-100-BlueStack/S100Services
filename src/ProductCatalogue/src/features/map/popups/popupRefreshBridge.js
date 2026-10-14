const refreshHandlers = new Set();
const sourceStatusRefreshHandlers = new Set();

// The Main-map source owner registers a handler; popup sessions only request
// a reload and never mutate AOI-owned member statuses or map symbols.
export function registerPopupSourceStatusRefreshHandler(handler) {
  if (typeof handler !== "function") return () => {};
  sourceStatusRefreshHandlers.add(handler);
  return () => sourceStatusRefreshHandlers.delete(handler);
}

export async function requestPopupSourceStatusRefresh(observation) {
  if (!String(observation?.sourceId ?? "").trim()) return [];
  return Promise.allSettled(
    [...sourceStatusRefreshHandlers].map((handler) =>
      Promise.resolve().then(() => handler(observation))
    )
  );
}

export function registerPopupRefreshHandler({ datasetName, refresh }) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName || typeof refresh !== "function") {
    return () => {};
  }

  const entry = {
    datasetName: normalizedDatasetName,
    refresh,
  };

  refreshHandlers.add(entry);

  return () => {
    refreshHandlers.delete(entry);
  };
}

export async function refreshOpenProductPopup(datasetName, options = {}) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    return {
      matched: 0,
      refreshed: 0,
    };
  }

  const matchingHandlers = [...refreshHandlers].filter((entry) => {
    return entry.datasetName === normalizedDatasetName;
  });

  if (matchingHandlers.length === 0) {
    return {
      matched: 0,
      refreshed: 0,
    };
  }

  const results = await Promise.allSettled(
    matchingHandlers.map((entry) => {
      return entry.refresh(options);
    })
  );

  return {
    matched: matchingHandlers.length,
    refreshed: results.filter((result) => {
      return result.status === "fulfilled" && result.value === true;
    }).length,
  };
}

function normalizeDatasetName(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
