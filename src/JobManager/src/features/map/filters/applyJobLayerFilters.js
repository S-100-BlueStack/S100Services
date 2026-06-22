import { normalizeJobFilters } from "../../jobs/domain/jobFilters.js";
import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { JOB_STATUS } from "../../jobs/domain/jobStatus.js";
import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";

const NO_FILTER_EXPRESSION = "1=1";

export function applyJobLayerFilters({ jobLayers, filters } = {}) {
  const definitionExpression = createJobLayerDefinitionExpression(filters);

  for (const layer of getJobLayers(jobLayers)) {
    layer.definitionExpression = definitionExpression;
  }

  return {
    definitionExpression,
  };
}

export function createJobLayerDefinitionExpression(filters = {}) {
  const normalizedFilters = normalizeJobFilters(filters);
  const expressionParts = [];

  if (normalizedFilters.activeOnly) {
    expressionParts.push(`${JOB_LAYER_FIELD.STATUS} <> '${escapeSqlString(JOB_STATUS.DONE)}'`);
  }

  if (normalizedFilters.highPriorityOnly) {
    expressionParts.push(`${JOB_LAYER_FIELD.PRIORITY} = '${escapeSqlString(JOB_PRIORITY.HIGH)}'`);
  }

  if (normalizedFilters.withRelatedAoisOnly) {
    expressionParts.push(`${JOB_LAYER_FIELD.RELATED_AOI_COUNT} > 0`);
  }

  if (normalizedFilters.statusValues.length > 0) {
    expressionParts.push(
      createInExpression(JOB_LAYER_FIELD.STATUS, normalizedFilters.statusValues)
    );
  }

  if (normalizedFilters.priorityValues.length > 0) {
    expressionParts.push(
      createInExpression(JOB_LAYER_FIELD.PRIORITY, normalizedFilters.priorityValues)
    );
  }

  return expressionParts.length > 0
    ? expressionParts.map((expressionPart) => `(${expressionPart})`).join(" AND ")
    : NO_FILTER_EXPRESSION;
}

function createInExpression(fieldName, values) {
  const escapedValues = values.map((value) => `'${escapeSqlString(value)}'`).join(", ");

  return `${fieldName} IN (${escapedValues})`;
}

function getJobLayers(jobLayers) {
  return [jobLayers?.pointLayer, jobLayers?.polygonLayer].filter(Boolean);
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}
