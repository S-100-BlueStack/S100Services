import { JOB_GEOMETRY_TYPE, JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";

export function createJobHighlightController({ view, jobLayers } = {}) {
  let highlightHandle = null;
  let activeHighlightToken = 0;

  async function highlightJob(selectedJob = {}) {
    activeHighlightToken += 1;
    const highlightToken = activeHighlightToken;

    clearHighlight();

    if (!view || !jobLayers || !selectedJob.jobId) {
      return;
    }

    const candidateLayers = getCandidateLayersForSelectedJob(jobLayers, selectedJob);

    for (const layer of candidateLayers) {
      const objectId = await queryObjectIdForJob(layer, selectedJob.jobId);

      if (!Number.isInteger(objectId) || highlightToken !== activeHighlightToken) {
        continue;
      }

      const layerView = await view.whenLayerView(layer);

      if (highlightToken !== activeHighlightToken) {
        return;
      }

      highlightHandle = layerView.highlight(objectId);
      return;
    }
  }

  function clearHighlight() {
    highlightHandle?.remove();
    highlightHandle = null;
  }

  function destroy() {
    activeHighlightToken += 1;
    clearHighlight();
  }

  return {
    highlightJob,
    clearHighlight,
    destroy,
  };
}

function getCandidateLayersForSelectedJob(jobLayers, selectedJob) {
  if (selectedJob.geometryType === JOB_GEOMETRY_TYPE.POINT) {
    return getPointCandidateLayers(jobLayers, selectedJob);
  }

  if (selectedJob.geometryType === JOB_GEOMETRY_TYPE.POLYGON) {
    return [jobLayers.polygonLayer].filter(Boolean);
  }

  return [];
}

function getPointCandidateLayers(jobLayers, selectedJob) {
  const priorityLayer = selectedJob.priority
    ? jobLayers.priorityPointLayers?.[selectedJob.priority]
    : null;

  return [
    priorityLayer?.visible ? priorityLayer : null,
    ...Object.values(jobLayers.priorityPointLayers ?? {}).filter(
      (layer) => layer?.visible && layer !== priorityLayer
    ),
    jobLayers.pointLayer,
  ].filter(Boolean);
}

async function queryObjectIdForJob(layer, jobId) {
  const query = layer.createQuery();
  query.where = `${JOB_LAYER_FIELD.JOB_ID} = '${escapeSqlString(jobId)}'`;
  query.outFields = [JOB_LAYER_FIELD.OBJECT_ID];
  query.returnGeometry = false;
  query.num = 1;

  const featureSet = await layer.queryFeatures(query);
  const objectId = featureSet.features?.[0]?.attributes?.[JOB_LAYER_FIELD.OBJECT_ID];

  if (!Number.isInteger(Number(objectId))) {
    return null;
  }

  return Number(objectId);
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}
