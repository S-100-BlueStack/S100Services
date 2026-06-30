import { createDefaultJobFilters } from "../../jobs/domain/jobFilters.js";
import { getAoiJobSummary } from "../../relations/domain/aoiJobSummary.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";
import {
  AOI_MAP_FILTER_MODE,
  hasActiveAoiMapFilters,
  normalizeAoiMapFilters,
} from "../domain/aoiMapFilters.js";

export async function applyAoiLayerFilters({
  aoiLayer,
  filters,
  jobFilters,
  relationService = defaultRelationService,
  shouldApply = () => true,
} = {}) {
  if (!aoiLayer) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-layer-missing",
    };
  }

  if (!shouldApply()) {
    return {
      ok: true,
      applied: false,
      reason: "stale-aoi-filter-request",
    };
  }

  const normalizedFilters = normalizeAoiMapFilters(filters);

  if (!hasActiveAoiMapFilters(normalizedFilters)) {
    aoiLayer.definitionExpression = "";

    return {
      ok: true,
      applied: true,
      data: {
        definitionExpression: "",
        aoiIds: [],
      },
    };
  }

  if (!relationService?.loadAoiJobRelationSnapshot) {
    aoiLayer.definitionExpression = "1 = 0";

    return {
      ok: false,
      applied: false,
      reason: "relation-service-missing",
    };
  }

  const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
    jobFilters: jobFilters ?? createDefaultJobFilters(),
  });

  if (!relationSnapshotResult.ok) {
    aoiLayer.definitionExpression = "1 = 0";

    return {
      ok: false,
      applied: false,
      error: relationSnapshotResult.error,
    };
  }

  if (!shouldApply()) {
    return {
      ok: true,
      applied: false,
      reason: "stale-aoi-filter-request",
    };
  }

  const aoiIds = getFilteredAoiIds({
    filters: normalizedFilters,
    summaryByAoiId: relationSnapshotResult.data.summaryByAoiId,
  });
  const definitionExpression = createAoiDefinitionExpression(aoiIds);

  aoiLayer.definitionExpression = definitionExpression;

  return {
    ok: true,
    applied: true,
    data: {
      definitionExpression,
      aoiIds,
    },
  };
}

function getFilteredAoiIds({ filters, summaryByAoiId } = {}) {
  const summaries = Object.keys(summaryByAoiId ?? {}).map((aoiId) =>
    getAoiJobSummary(summaryByAoiId, aoiId)
  );

  return summaries
    .filter((summary) => matchesAoiMapFilter(summary, filters))
    .map((summary) => summary.aoiId)
    .filter(Boolean);
}

function matchesAoiMapFilter(summary, filters) {
  switch (filters.mode) {
    case AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS:
      return summary.total > 0;
    case AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS:
      return summary.active > 0;
    case AOI_MAP_FILTER_MODE.WITH_HIGH_PRIORITY_JOBS:
      return summary.activeHighPriority > 0;
    default:
      return true;
  }
}

function createAoiDefinitionExpression(aoiIds) {
  const normalizedAoiIds = normalizeAoiIds(aoiIds);

  if (normalizedAoiIds.length === 0) {
    return "1 = 0";
  }

  const values = normalizedAoiIds.map((aoiId) => `'${escapeSqlString(aoiId)}'`).join(", ");

  return `${AOI_FIELD.GLOBAL_ID} IN (${values})`;
}

function normalizeAoiIds(aoiIds) {
  if (!Array.isArray(aoiIds)) {
    return [];
  }

  return [...new Set(aoiIds.map(normalizeOptionalString).filter(Boolean))];
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}
