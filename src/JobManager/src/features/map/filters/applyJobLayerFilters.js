import {
  normalizeJobFilters,
  shouldRevealDoneJobsForFilters,
} from "../../jobs/domain/jobFilters.js";
import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { JOB_STATUS } from "../../jobs/domain/jobStatus.js";
import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";

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

  if (!shouldRevealDoneJobsForFilters(normalizedFilters)) {
    expressionParts.push(`${JOB_LAYER_FIELD.STATUS} <> '${escapeSqlString(JOB_STATUS.DONE)}'`);
  }

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

  return dedupeExpressionParts(expressionParts)
    .map((expressionPart) => `(${expressionPart})`)
    .join(" AND ");
}

function createInExpression(fieldName, values) {
  const escapedValues = values.map((value) => `'${escapeSqlString(value)}'`).join(", ");

  return `${fieldName} IN (${escapedValues})`;
}

function dedupeExpressionParts(expressionParts) {
  return [...new Set(expressionParts)];
}

function getJobLayers(jobLayers) {
  return [jobLayers?.pointLayer, jobLayers?.polygonLayer].filter(Boolean);
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}
