import Graphic from "@arcgis/core/Graphic.js";

import { createErrorResult, createSuccessResult } from "../../../shared/api/apiResult.js";
import * as defaultJobService from "../../jobs/services/jobService.js";
import { createJobLayerFeatureData, JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";

export async function applyJobLayerData({ jobLayers, jobs, jobService = defaultJobService } = {}) {
  if (!jobLayers?.pointLayer || !jobLayers?.polygonLayer) {
    return createSuccessResult(
      {
        pointCount: 0,
        polygonCount: 0,
      },
      {
        operation: "applyJobLayerData",
        reason: "job-layers-missing",
      }
    );
  }

  const jobsResult = await resolveJobs({
    jobs,
    jobService,
  });

  if (!jobsResult.ok) {
    return createErrorResult(jobsResult.error, {
      operation: "applyJobLayerData",
    });
  }

  const featureData = createJobLayerFeatureData(jobsResult.data.jobs);

  await Promise.all([
    replaceLayerFeatures(jobLayers.pointLayer, featureData.pointFeatures),
    replaceLayerFeatures(jobLayers.polygonLayer, featureData.polygonFeatures),
  ]);

  return createSuccessResult(
    {
      pointCount: featureData.pointFeatures.length,
      polygonCount: featureData.polygonFeatures.length,
    },
    {
      operation: "applyJobLayerData",
    }
  );
}

async function replaceLayerFeatures(layer, featureData) {
  await layer.load();

  const deleteFeatures = await queryExistingFeatures(layer);
  const addFeatures = createGraphics(featureData);

  if (deleteFeatures.length === 0 && addFeatures.length === 0) {
    return;
  }

  const editsResult = await layer.applyEdits({
    deleteFeatures,
    addFeatures,
  });

  assertEditResults(editsResult);
}

async function queryExistingFeatures(layer) {
  const query = layer.createQuery();

  query.where = "1=1";
  query.outFields = [JOB_LAYER_FIELD.OBJECT_ID];
  query.returnGeometry = false;

  const featureSet = await layer.queryFeatures(query);

  return featureSet.features ?? [];
}

function createGraphics(featureData) {
  return featureData.map(
    (feature) =>
      new Graphic({
        geometry: feature.geometry,
        attributes: feature.attributes,
      })
  );
}

function assertEditResults(editsResult) {
  const failedEdit = [
    ...(editsResult.addFeatureResults ?? []),
    ...(editsResult.deleteFeatureResults ?? []),
  ].find((result) => result.error);

  if (!failedEdit) {
    return;
  }

  throw new Error(failedEdit.error?.message || "Job layer edits failed.");
}

async function resolveJobs({ jobs, jobService }) {
  if (Array.isArray(jobs)) {
    return createSuccessResult(
      {
        jobs,
      },
      {
        source: "provided-jobs",
      }
    );
  }

  if (!jobService?.loadJobs) {
    return createErrorResult(new Error("Job service is not available."), {
      source: "job-layer-data",
    });
  }

  return jobService.loadJobs();
}
