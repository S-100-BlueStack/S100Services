import Graphic from "@arcgis/core/Graphic.js";

import { createErrorResult, createSuccessResult } from "../../../shared/api/apiResult.js";
import * as defaultJobService from "../../jobs/services/jobService.js";
import { createJobLayerFeatureData } from "./jobLayerFeatureData.js";
import { replaceJobLayerFeatures } from "./replaceJobLayerFeatures.js";

export async function applyJobLayerData({
  jobLayers,
  jobs,
  jobService = defaultJobService,
  shouldApply = () => true,
} = {}) {
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

  if (!shouldApply()) {
    return supersededResult();
  }

  const featureData = createJobLayerFeatureData(jobsResult.data.jobs);
  const writes = await Promise.allSettled([
    ...getPointLayers(jobLayers).map((pointLayer) =>
      replaceJobLayerFeatures({
        layer: pointLayer,
        featureData: featureData.pointFeatures,
        createGraphics,
        shouldApply,
      })
    ),
    replaceJobLayerFeatures({
      layer: jobLayers.polygonLayer,
      featureData: featureData.polygonFeatures,
      createGraphics,
      shouldApply,
    }),
  ]);

  // A failed layer must not release the queue while other layer edits remain in flight.
  const failedWrite = writes.find((result) => result.status === "rejected");

  if (failedWrite) {
    throw failedWrite.reason;
  }

  if (!shouldApply()) {
    return supersededResult();
  }

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

function getPointLayers(jobLayers) {
  return [jobLayers?.pointLayer, ...Object.values(jobLayers?.priorityPointLayers ?? {})].filter(
    Boolean
  );
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

function supersededResult() {
  return createSuccessResult(
    { pointCount: 0, polygonCount: 0 },
    { operation: "applyJobLayerData", superseded: true }
  );
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
