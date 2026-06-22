import assert from "node:assert/strict";
import test from "node:test";

import {
  applyJobLayerFilters,
  createJobLayerDefinitionExpression,
} from "./applyJobLayerFilters.js";

test("createJobLayerDefinitionExpression hides Done Jobs by default", () => {
  assert.equal(createJobLayerDefinitionExpression(), "(status <> 'done')");
});

test("createJobLayerDefinitionExpression applies quick filters while keeping Done hidden", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }),
    "(status <> 'done') AND (priority = 'high') AND (relatedAoiCount > 0)"
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
    "(status <> 'done') AND (status IN ('done'))"
  );
});

test("createJobLayerDefinitionExpression applies explicit non-Done status and priority filters", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["todo"],
      priorityValues: ["high", "medium"],
    }),
    "(status <> 'done') AND (status IN ('todo')) AND (priority IN ('high', 'medium'))"
  );
});

test("createJobLayerDefinitionExpression applies mixed status filters without default Done hiding", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["todo", "done"],
      priorityValues: ["high"],
    }),
    "(status IN ('todo', 'done')) AND (priority IN ('high'))"
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
