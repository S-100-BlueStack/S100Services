import assert from "node:assert/strict";
import test from "node:test";

import { AOI_MAP_FILTER_MODE } from "../domain/aoiMapFilters.js";
import { applyAoiLayerFilters } from "./applyAoiLayerFilters.js";

const GLOBAL_ID = "11111111-1111-1111-1111-111111111111";

test("applyAoiLayerFilters returns safely when the AOI layer is missing", async () => {
  const result = await applyAoiLayerFilters({
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "aoi-layer-missing");
});

test("applyAoiLayerFilters clears the layer expression when AOI overview filters are inactive", async () => {
  const aoiLayer = createAoiLayerStub();
  aoiLayer.definitionExpression = "GlobalID IN ('previous')";

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.ALL,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(aoiLayer.definitionExpression, "");
  assert.deepEqual(result.data, {
    definitionExpression: "",
    aoiIds: [],
    didFallbackToAllAois: false,
  });
});

test("applyAoiLayerFilters falls back to all AOIs when the relation service is missing", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
    relationService: null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.reason, "relation-service-missing");
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
});

test("applyAoiLayerFilters falls back to all AOIs when relation snapshot loading fails", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: false,
          error: new Error("Relation snapshot failed."),
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.reason, "relation-snapshot-failed");
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
});

test("applyAoiLayerFilters creates a safe GlobalID expression for compatible relation ids", async () => {
  const aoiLayer = createAoiLayerStub();
  let receivedJobFilters = null;
  let receivedJobs = null;

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_HIGH_PRIORITY_JOBS,
    },
    jobFilters: {
      highPriorityOnly: true,
    },
    jobs: [{ id: "job-001" }],
    relationService: {
      async loadAoiJobRelationSnapshot({ jobFilters, jobs }) {
        receivedJobFilters = jobFilters;
        receivedJobs = jobs;

        return {
          ok: true,
          data: {
            summaryByAoiId: {
              [GLOBAL_ID]: {
                aoiId: GLOBAL_ID,
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
  assert.equal(aoiLayer.definitionExpression, `GlobalID IN ('${GLOBAL_ID}', '{${GLOBAL_ID}}')`);
  assert.equal(result.data.didFallbackToAllAois, false);
  assert.deepEqual(result.data.matchedAoiIds, [GLOBAL_ID]);
  assert.deepEqual(receivedJobFilters, {
    highPriorityOnly: true,
  });
  assert.deepEqual(receivedJobs, [{ id: "job-001" }]);
});

test("applyAoiLayerFilters hides all AOIs only for a compatible no-match result", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: true,
          data: {
            summaryByAoiId: {
              [GLOBAL_ID]: {
                aoiId: GLOBAL_ID,
                total: 1,
                active: 0,
                highPriority: 1,
                activeHighPriority: 0,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(aoiLayer.definitionExpression, "1 = 0");
  assert.equal(result.data.didFallbackToAllAois, false);
  assert.equal(result.data.reason, "no-aoi-ids-for-active-filter");
});

test("applyAoiLayerFilters keeps all AOIs visible for incompatible relation ids", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: true,
          data: {
            summaryByAoiId: {
              "mock-aoi-001": {
                aoiId: "mock-aoi-001",
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
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
  assert.equal(result.data.reason, "relation-aoi-ids-are-not-globalids");
});

function createAoiLayerStub() {
  return {
    fields: [
      {
        name: "GlobalID",
      },
    ],
    definitionExpression: "",
  };
}
