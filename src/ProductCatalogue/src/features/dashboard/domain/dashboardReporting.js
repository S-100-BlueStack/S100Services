// Keep optional reporting fields separate from the legacy activity contract.
// Older/demo responses must show unavailable metrics, not invented zero totals.
export function normalizeDashboardReporting(data = {}) {
  const source = isObject(data) ? data : {};
  return {
    distribution: normalizeDistribution(readField(source, "distribution")),
    operationalHealth: normalizeOperationalHealth(readField(source, "operationalHealth")),
    reportSummary: normalizeReportSummary(readField(source, "reportSummary")),
    activityTrend: normalizeActivityTrend(readField(source, "activityTrend")),
    distributionTrend: normalizeDistributionTrend(readField(source, "distributionTrend")),
    productBreakdown: normalizeProductBreakdown(readField(source, "productBreakdown")),
  };
}

function normalizeDistribution(value) {
  if (!isObject(value)) {
    return null;
  }
  return {
    live: normalizeDistributionCounts(readField(value, "live")),
    simulation: normalizeDistributionCounts(readField(value, "simulation")),
    bySpecification: normalizeDistributionBreakdown(readField(value, "bySpecification")),
  };
}

function normalizeDistributionBreakdown(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const specification = readString(item, "productSpecification");
      const counts = normalizeDistributionCounts(readField(item, "counts"));
      if (!specification || !counts) {
        return null;
      }
      return {
        specification,
        isSimulation: readField(item, "isSimulation") === true,
        counts,
      };
    })
    .filter(Boolean);
}

function normalizeDistributionCounts(value) {
  if (!isObject(value)) {
    return null;
  }
  return {
    sent: readCount(value, "sent"),
    accepted: readCount(value, "accepted"),
    rejected: readCount(value, "rejected"),
    pending: readCount(value, "pending"),
    uncertain: readCount(value, "uncertain"),
    acceptanceRatePercent: readPercentage(value, "acceptanceRatePercent"),
  };
}

function normalizeOperationalHealth(value) {
  if (!isObject(value)) {
    return null;
  }
  return {
    tracks: readCount(value, "tracks"),
    openErrors: readCount(value, "openErrors"),
    processing: readCount(value, "processing"),
    awaitingIcEnc: readCount(value, "awaitingIcEnc"),
    paused: readCount(value, "paused"),
    asOfUtc: readDate(value, "asOfUtc"),
  };
}

function normalizeReportSummary(value) {
  if (!isObject(value)) {
    return null;
  }
  return {
    total: readCount(value, "total"),
    icEnc: readCount(value, "icEnc"),
    internalValidation: readCount(value, "internalValidation"),
    validationDiagnostics: readCount(value, "validationDiagnostics"),
  };
}

function normalizeActivityTrend(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const day = readDay(item);
      const activities = readCount(item, "activities");
      if (!day || activities === null) {
        return null;
      }
      return {
        day,
        activities,
        failed: readCount(item, "failed"),
        important: readCount(item, "important"),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.day.localeCompare(right.day));
}

function normalizeDistributionTrend(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const day = readDay(item);
      if (!day) {
        return null;
      }
      return {
        day,
        sent: readCount(item, "sent"),
        accepted: readCount(item, "accepted"),
        rejected: readCount(item, "rejected"),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.day.localeCompare(right.day));
}

function normalizeProductBreakdown(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const specification = readString(item, "productSpecification");
      const activities = readCount(item, "activities");
      if (!specification || activities === null) {
        return null;
      }
      return {
        specification,
        activities,
        productsTouched: readCount(item, "productsTouched"),
        failed: readCount(item, "failed"),
      };
    })
    .filter(Boolean);
}

function readField(source, key) {
  if (!isObject(source)) {
    return undefined;
  }
  const pascalKey = `${key[0].toUpperCase()}${key.slice(1)}`;
  return source[key] ?? source[pascalKey];
}

function readCount(source, key) {
  const value = readField(source, key);
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function readPercentage(source, key) {
  const value = readField(source, key);
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const percentage = Number(value);
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100 ? percentage : null;
}

function readString(source, key) {
  const value = readField(source, key);
  return typeof value === "string" ? value.trim() : "";
}

function readDate(source, key) {
  const value = readString(source, key);
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function readDay(source) {
  const value = readString(source, "day");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
