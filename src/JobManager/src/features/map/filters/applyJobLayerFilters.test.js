import assert from "node:assert/strict";
import test from "node:test";

import {
  applyJobLayerFilters,
  createJobLayerDefinitionExpression,
} from "./applyJobLayerFilters.js";

test("createJobLayerDefinitionExpression returns a no-op expression for inactive filters", () => {
  assert.equal(createJobLayerDefinitionExpression(), "1=1");
});

test("createJobLayerDefinitionExpression applies quick filters", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }),
    "(status <> 'done') AND (priority = 'high') AND (relatedAoiCount > 0)"
  );
});

test("createJobLayerDefinitionExpression applies explicit status and priority filters", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["todo", "done"],
      priorityValues: ["high", "medium"],
    }),
    "(status IN ('todo', 'done')) AND (priority IN ('high', 'medium'))"
  );
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
