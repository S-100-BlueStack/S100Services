import assert from "node:assert/strict";
import test from "node:test";

import { applyAoiJobSummaryRenderer } from "./applyAoiRenderer.js";

test("applyAoiJobSummaryRenderer passes Job filters to relation snapshot loading", async () => {
  let receivedJobFilters = null;
  const aoiLayer = {};
  const jobFilters = {
    highPriorityOnly: true,
  };

  const result = await applyAoiJobSummaryRenderer({
    aoiLayer,
    jobFilters,
    relationService: {
      async loadAoiJobRelationSnapshot(options) {
        receivedJobFilters = options.jobFilters;

        return {
          ok: true,
          data: {
            relations: [{ jobId: "job-001", aoiIds: ["aoi-001"], source: "mock" }],
            summaries: [
              {
                aoiId: "aoi-001",
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            ],
            summaryByAoiId: {
              "aoi-001": {
                aoiId: "aoi-001",
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.deepEqual(receivedJobFilters, jobFilters);
  assert.equal(aoiLayer.renderer.type, "class-breaks");
});

test("applyAoiJobSummaryRenderer skips stale renderer requests before applying default renderer", async () => {
  const existingRenderer = {
    type: "simple",
  };
  const aoiLayer = {
    renderer: existingRenderer,
  };

  const result = await applyAoiJobSummaryRenderer({
    aoiLayer,
    shouldApply() {
      return false;
    },
  });

  assert.deepEqual(result, {
    ok: true,
    applied: false,
    reason: "stale-renderer-request",
  });
  assert.equal(aoiLayer.renderer, existingRenderer);
});
