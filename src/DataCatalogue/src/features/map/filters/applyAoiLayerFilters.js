import { createDefaultJobFilters } from "../../jobs/domain/jobFilters.js";
import { getAoiJobSummary } from "../../relations/domain/aoiJobSummary.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { AOI_FIELD, AOI_TEST_FIELD_CONFIG } from "../../aoi/config/aoiFieldConfig.js";
import {
  AOI_MAP_FILTER_MODE,
  hasActiveAoiMapFilters,
  normalizeAoiMapFilters,
} from "../domain/aoiMapFilters.js";

export async function applyAoiLayerFilters({
  aoiLayer,
  filters,
  jobFilters,
  jobs,
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
        didFallbackToAllAois: false,
      },
    };
  }

  if (!relationService?.loadAoiJobRelationSnapshot) {
    aoiLayer.definitionExpression = "";

    return {
      ok: true,
      applied: true,
      reason: "relation-service-missing",
      data: {
        definitionExpression: "",
        aoiIds: [],
        didFallbackToAllAois: true,
      },
    };
  }

  const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
    jobs,
    jobFilters: jobFilters ?? createDefaultJobFilters(),
  });

  if (!relationSnapshotResult.ok) {
    aoiLayer.definitionExpression = "";

    return {
      ok: true,
      applied: true,
      reason: "relation-snapshot-failed",
      data: {
        definitionExpression: "",
        aoiIds: [],
        didFallbackToAllAois: true,
      },
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
  const expressionResult = createSafeAoiDefinitionExpression({
    aoiLayer,
    aoiIds,
  });

  aoiLayer.definitionExpression = expressionResult.definitionExpression;

  return {
    ok: true,
    applied: true,
    data: {
      ...expressionResult,
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

function createSafeAoiDefinitionExpression({ aoiLayer, aoiIds } = {}) {
  const normalizedAoiIds = normalizeAoiIds(aoiIds);

  if (normalizedAoiIds.length === 0) {
    return {
      definitionExpression: "1 = 0",
      matchedAoiIds: [],
      didFallbackToAllAois: false,
      reason: "no-aoi-ids-for-active-filter",
    };
  }

  const globalIdCompatibleAoiIds = normalizedAoiIds.filter(isLikelyGlobalId);

  if (globalIdCompatibleAoiIds.length === 0) {
    return {
      definitionExpression: "",
      matchedAoiIds: [],
      didFallbackToAllAois: true,
      reason: "relation-aoi-ids-are-not-globalids",
    };
  }

  return {
    definitionExpression: createAoiDefinitionExpression({
      aoiLayer,
      aoiIds: globalIdCompatibleAoiIds,
    }),
    matchedAoiIds: globalIdCompatibleAoiIds,
    didFallbackToAllAois: false,
    reason: "",
  };
}

function createAoiDefinitionExpression({ aoiLayer, aoiIds } = {}) {
  const fieldName = resolveAoiIdFieldName(aoiLayer);
  const values = normalizeAoiIds(aoiIds)
    .flatMap(createGlobalIdExpressionValues)
    .map((aoiId) => `'${escapeSqlString(aoiId)}'`)
    .join(", ");

  return `${fieldName} IN (${values})`;
}

function resolveAoiIdFieldName(aoiLayer) {
  const configuredFieldName = normalizeOptionalString(
    AOI_TEST_FIELD_CONFIG.idField || AOI_FIELD.GLOBAL_ID
  );
  const configuredFieldNameLower = configuredFieldName.toLowerCase();
  const matchingLayerField = normalizeArray(aoiLayer?.fields).find(
    (field) => normalizeOptionalString(field?.name).toLowerCase() === configuredFieldNameLower
  );

  return normalizeOptionalString(matchingLayerField?.name) || configuredFieldName;
}

function createGlobalIdExpressionValues(value) {
  const normalizedValue = normalizeOptionalString(value);
  const withoutBraces = normalizedValue.replace(/^\{/, "").replace(/\}$/, "");

  return [...new Set([normalizedValue, withoutBraces, `{${withoutBraces}}`].filter(Boolean))];
}

function isLikelyGlobalId(value) {
  const normalizedValue = normalizeOptionalString(value).replace(/^\{/, "").replace(/\}$/, "");

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedValue);
}

function normalizeAoiIds(aoiIds) {
  if (!Array.isArray(aoiIds)) {
    return [];
  }

  return [...new Set(aoiIds.map(normalizeOptionalString).filter(Boolean))];
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
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
