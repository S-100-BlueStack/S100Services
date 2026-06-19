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

    const layer = getLayerForSelectedJob(jobLayers, selectedJob);

    if (!layer) {
      return;
    }

    const objectId = selectedJob.objectId ?? (await queryObjectIdForJob(layer, selectedJob.jobId));

    if (!Number.isInteger(objectId) || highlightToken !== activeHighlightToken) {
      return;
    }

    const layerView = await view.whenLayerView(layer);

    if (highlightToken !== activeHighlightToken) {
      return;
    }

    highlightHandle = layerView.highlight(objectId);
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

function getLayerForSelectedJob(jobLayers, selectedJob) {
  if (selectedJob.geometryType === JOB_GEOMETRY_TYPE.POINT) {
    return jobLayers.pointLayer ?? null;
  }

  if (selectedJob.geometryType === JOB_GEOMETRY_TYPE.POLYGON) {
    return jobLayers.polygonLayer ?? null;
  }

  return null;
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
