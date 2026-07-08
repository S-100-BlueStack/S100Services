export function createDashboardSummary({ summary = {}, activities = [] } = {}) {
  const normalizedActivities = Array.isArray(activities) ? activities : [];

  return {
    totalActivities: readNumber(summary.totalActivities, normalizedActivities.length),
    productsTouched: readNumber(summary.productsTouched, countProducts(normalizedActivities)),
    importantChanges: readNumber(summary.importantChanges, countImportant(normalizedActivities)),
    failedOperations: readNumber(summary.failedOperations, countFailed(normalizedActivities)),
    reportsAvailable: readNumber(summary.reportsAvailable, countReports(normalizedActivities)),
  };
}

function countProducts(activities) {
  return new Set(activities.map((activity) => activity.datasetName).filter(Boolean)).size;
}

function countImportant(activities) {
  return activities.filter((activity) => activity.isImportant).length;
}

function countFailed(activities) {
  return activities.filter((activity) => activity.status === "failed").length;
}

function countReports(activities) {
  return activities.filter((activity) => {
    return activity.links.icEncReport?.available || activity.links.internalValidation?.available;
  }).length;
}

function readNumber(value, fallbackValue) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}
