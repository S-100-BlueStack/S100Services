export function createDashboardSummary({ summary = {}, activities = [] } = {}) {
  const normalizedActivities = normalizeActivities(activities);

  return {
    totalActivities: readNumber(
      summary.totalActivities ?? summary.TotalActivities,
      normalizedActivities.length
    ),
    productsTouched: readNumber(
      summary.productsTouched ?? summary.ProductsTouched,
      countProducts(normalizedActivities)
    ),
    importantChanges: readNumber(
      summary.importantChanges ?? summary.ImportantChanges,
      countImportant(normalizedActivities)
    ),
    failedOperations: readNumber(
      summary.failedOperations ?? summary.FailedOperations,
      countFailed(normalizedActivities)
    ),
    reportsAvailable: readNumber(
      summary.reportsAvailable ?? summary.ReportsAvailable,
      countReports(normalizedActivities)
    ),
  };
}

export function createDashboardSummaryFromActivities(activities = []) {
  const normalizedActivities = normalizeActivities(activities);

  // Filtered dashboard views must not reuse backend totals, because the cards
  // need to describe exactly the rows the user is currently looking at.
  return {
    totalActivities: normalizedActivities.length,
    productsTouched: countProducts(normalizedActivities),
    importantChanges: countImportant(normalizedActivities),
    failedOperations: countFailed(normalizedActivities),
    reportsAvailable: countReports(normalizedActivities),
  };
}

function normalizeActivities(activities) {
  return Array.isArray(activities) ? activities : [];
}

function countProducts(activities) {
  return new Set(activities.map((activity) => activity.datasetName).filter(Boolean)).size;
}

function countImportant(activities) {
  return activities.filter((activity) => activity.isImportant).length;
}

function countFailed(activities) {
  return activities.filter((activity) => {
    return ["failed", "error", "rejected"].includes(activity.status);
  }).length;
}

function countReports(activities) {
  return activities.reduce((count, activity) => {
    return (
      count +
      (activity.links?.icEncReports?.length ?? 0) +
      (activity.links?.internalValidationReports?.length ?? 0)
    );
  }, 0);
}

function readNumber(value, fallbackValue) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}
