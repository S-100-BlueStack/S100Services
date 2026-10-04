const refreshHandlers = new Set();

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
