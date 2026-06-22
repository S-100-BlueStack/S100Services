import { createDefaultJobFilters } from "../../jobs/domain/jobFilters.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { createAoiJobSummaryRenderer, createDefaultAoiRenderer } from "./aoiRenderer.js";

export async function applyAoiJobSummaryRenderer({
  aoiLayer,
  relationService = defaultRelationService,
  jobFilters,
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
      reason: "stale-renderer-request",
    };
  }

  const resolvedJobFilters = jobFilters ?? createDefaultJobFilters();

  aoiLayer.renderer = createDefaultAoiRenderer();

  if (!relationService?.loadAoiJobRelationSnapshot) {
    return {
      ok: false,
      applied: false,
      reason: "relation-service-missing",
    };
  }

  const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
    jobFilters: resolvedJobFilters,
  });

  if (!relationSnapshotResult.ok) {
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
      reason: "stale-renderer-request",
    };
  }

  aoiLayer.renderer = createAoiJobSummaryRenderer(relationSnapshotResult.data.summaryByAoiId);

  return {
    ok: true,
    applied: true,
    data: {
      relationCount: relationSnapshotResult.data.relations.length,
      summaryCount: relationSnapshotResult.data.summaries.length,
    },
  };
}
