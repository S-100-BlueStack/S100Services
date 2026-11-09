import assert from "node:assert/strict";
import test from "node:test";

import {
  applyJobLayerFilters,
  createJobLayerDefinitionExpression,
} from "./applyJobLayerFilters.js";

test("createJobLayerDefinitionExpression hides Done Jobs by default", () => {
  assert.equal(createJobLayerDefinitionExpression(), "(status NOT IN ('done', 'noUpdate'))");
});

test("createJobLayerDefinitionExpression applies quick filters while keeping Done hidden", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }),
    "(status NOT IN ('done', 'noUpdate')) AND (priority = 'high') AND (relatedAoiCount > 0)"
  );
});

test("createJobLayerDefinitionExpression reveals Done Jobs for explicit Done status filter", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["done"],
    }),
    "(status IN ('done'))"
  );
});

test("createJobLayerDefinitionExpression keeps contradictory Active and Done filters explicit", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      statusValues: ["done"],
    }),
    "(status NOT IN ('done', 'noUpdate')) AND (status IN ('done'))"
  );
});

test("createJobLayerDefinitionExpression applies explicit non-Done status and priority filters", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["noUpdate"],
      priorityValues: ["high", "medium"],
    }),
    "(status IN ('noUpdate')) AND (priority IN ('high', 'medium'))"
  );
});

test("createJobLayerDefinitionExpression applies mixed status filters without default Done hiding", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["noUpdate", "done"],
      priorityValues: ["high"],
    }),
    "(status IN ('noUpdate', 'done')) AND (priority IN ('high'))"
  );
});

test("createJobLayerDefinitionExpression adds scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: ["job-001", "job-002"],
      }
    ),
    "(status NOT IN ('done', 'noUpdate')) AND (jobId IN ('job-001', 'job-002'))"
  );
});

test("createJobLayerDefinitionExpression creates an empty scoped result", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: [],
      }
    ),
    "(status NOT IN ('done', 'noUpdate')) AND (1 = 0)"
  );
});

test("createJobLayerDefinitionExpression combines active filters and scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {
        highPriorityOnly: true,
      },
      {
        scopedJobIds: ["job-001"],
      }
    ),
    "(status NOT IN ('done', 'noUpdate')) AND (priority = 'high') AND (jobId IN ('job-001'))"
  );
});

test("createJobLayerDefinitionExpression escapes scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: ["job-'quoted"],
      }
    ),
    "(status NOT IN ('done', 'noUpdate')) AND (jobId IN ('job-''quoted'))"
  );
});

test("createJobLayerDefinitionExpression keeps no-scope filters unchanged", () => {
  const expression = createJobLayerDefinitionExpression({});

  assert.equal(expression, "(status NOT IN ('done', 'noUpdate'))");
  assert.doesNotMatch(expression, /jobId IN/);
  assert.doesNotMatch(expression, /1 = 0/);
});

test("applyJobLayerFilters updates both Job geometry layers", () => {
  const pointLayer = {};
  const polygonLayer = {};

  const result = applyJobLayerFilters({
    jobLayers: {
      pointLayer,
      polygonLayer,
    },
    filters: {
      statusValues: ["done"],
    },
  });

  assert.equal(result.definitionExpression, "(status IN ('done'))");
  assert.equal(pointLayer.definitionExpression, "(status IN ('done'))");
  assert.equal(polygonLayer.definitionExpression, "(status IN ('done'))");
});

test("applyJobLayerFilters applies scoped Job ids to base layers", () => {
  const pointLayer = {};
  const polygonLayer = {};

  const result = applyJobLayerFilters({
    jobLayers: {
      pointLayer,
      polygonLayer,
    },
    scopedJobIds: ["job-001"],
  });

  assert.equal(
    result.definitionExpression,
    "(status NOT IN ('done', 'noUpdate')) AND (jobId IN ('job-001'))"
  );
  assert.equal(
    pointLayer.definitionExpression,
    "(status NOT IN ('done', 'noUpdate')) AND (jobId IN ('job-001'))"
  );
  assert.equal(
    polygonLayer.definitionExpression,
    "(status NOT IN ('done', 'noUpdate')) AND (jobId IN ('job-001'))"
  );
});

test("Explicit No update status is visible without a default completed exclusion", () => {
  assert.equal(
    createJobLayerDefinitionExpression({ statusValues: ["noUpdate"] }),
    "(status IN ('noUpdate'))"
  );
});
