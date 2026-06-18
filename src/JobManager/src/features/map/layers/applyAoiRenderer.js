import * as defaultRelationService from "../../relations/services/relationService.js";
import { createAoiJobSummaryRenderer, createDefaultAoiRenderer } from "./aoiRenderer.js";

export async function applyAoiJobSummaryRenderer({
  aoiLayer,
  relationService = defaultRelationService,
} = {}) {
  if (!aoiLayer) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-layer-missing",
    };
  }

  aoiLayer.renderer = createDefaultAoiRenderer();

  if (!relationService?.loadAoiJobRelationSnapshot) {
    return {
      ok: false,
      applied: false,
      reason: "relation-service-missing",
    };
  }

  const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot();

  if (!relationSnapshotResult.ok) {
    return {
      ok: false,
      applied: false,
      error: relationSnapshotResult.error,
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
