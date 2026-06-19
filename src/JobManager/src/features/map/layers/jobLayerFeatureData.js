import { getJobPriorityLabel, JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { getJobStatusLabel, JOB_STATUS } from "../../jobs/domain/jobStatus.js";

export const JOB_LAYER_FIELD = Object.freeze({
  OBJECT_ID: "ObjectID",
  JOB_ID: "jobId",
  TITLE: "title",
  SUMMARY: "summary",
  STATUS: "status",
  STATUS_LABEL: "statusLabel",
  PRIORITY: "priority",
  PRIORITY_LABEL: "priorityLabel",
  RELATED_AOI_COUNT: "relatedAoiCount",
  CREATED_AT: "createdAt",
  DEADLINE: "deadline",
  GEOMETRY_TYPE: "geometryType",
  RENDER_CLASS: "renderClass",
});

export const JOB_GEOMETRY_TYPE = Object.freeze({
  POINT: "point",
  POLYGON: "polygon",
});

export const JOB_RENDER_CLASS = Object.freeze({
  ACTIVE_LOW: "active-low",
  ACTIVE_MEDIUM: "active-medium",
  ACTIVE_HIGH: "active-high",
  DONE: "done",
});

export function createJobLayerFields() {
  return [
    {
      name: JOB_LAYER_FIELD.OBJECT_ID,
      alias: "Object ID",
      type: "oid",
    },
    {
      name: JOB_LAYER_FIELD.JOB_ID,
      alias: "Job ID",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.TITLE,
      alias: "Title",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.SUMMARY,
      alias: "Summary",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.STATUS,
      alias: "Status value",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.STATUS_LABEL,
      alias: "Status",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.PRIORITY,
      alias: "Priority value",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.PRIORITY_LABEL,
      alias: "Priority",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.RELATED_AOI_COUNT,
      alias: "Affected AOIs",
      type: "integer",
    },
    {
      name: JOB_LAYER_FIELD.CREATED_AT,
      alias: "Created",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.DEADLINE,
      alias: "Deadline",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.GEOMETRY_TYPE,
      alias: "Geometry type",
      type: "string",
    },
    {
      name: JOB_LAYER_FIELD.RENDER_CLASS,
      alias: "Render class",
      type: "string",
    },
  ];
}

export function createJobLayerFeatureData(jobs = []) {
  const pointFeatures = [];
  const polygonFeatures = [];
  let objectId = 1;

  for (const job of normalizeArray(jobs)) {
    const geometry = createJobGeometry(job.geometry);

    if (!geometry) {
      continue;
    }

    const feature = {
      geometry,
      attributes: createJobAttributes({
        job,
        objectId,
        geometryType: geometry.type,
      }),
    };

    objectId += 1;

    if (geometry.type === JOB_GEOMETRY_TYPE.POINT) {
      pointFeatures.push(feature);
      continue;
    }

    if (geometry.type === JOB_GEOMETRY_TYPE.POLYGON) {
      polygonFeatures.push(feature);
    }
  }

  return {
    pointFeatures,
    polygonFeatures,
  };
}

export function getJobRenderClass(job) {
  if (job?.status === JOB_STATUS.DONE) {
    return JOB_RENDER_CLASS.DONE;
  }

  if (job?.priority === JOB_PRIORITY.HIGH) {
    return JOB_RENDER_CLASS.ACTIVE_HIGH;
  }

  if (job?.priority === JOB_PRIORITY.LOW) {
    return JOB_RENDER_CLASS.ACTIVE_LOW;
  }

  return JOB_RENDER_CLASS.ACTIVE_MEDIUM;
}

function createJobAttributes({ job, objectId, geometryType }) {
  return {
    [JOB_LAYER_FIELD.OBJECT_ID]: objectId,
    [JOB_LAYER_FIELD.JOB_ID]: normalizeOptionalString(job.id),
    [JOB_LAYER_FIELD.TITLE]: normalizeOptionalString(job.title) || "Untitled Job",
    [JOB_LAYER_FIELD.SUMMARY]: normalizeOptionalString(job.summary),
    [JOB_LAYER_FIELD.STATUS]: normalizeOptionalString(job.status),
    [JOB_LAYER_FIELD.STATUS_LABEL]: getJobStatusLabel(job.status),
    [JOB_LAYER_FIELD.PRIORITY]: normalizeOptionalString(job.priority),
    [JOB_LAYER_FIELD.PRIORITY_LABEL]: getJobPriorityLabel(job.priority),
    [JOB_LAYER_FIELD.RELATED_AOI_COUNT]: normalizeArray(job.relatedAoiIds).length,
    [JOB_LAYER_FIELD.CREATED_AT]: formatDateForDisplay(job.createdAt),
    [JOB_LAYER_FIELD.DEADLINE]: formatDateForDisplay(job.deadline),
    [JOB_LAYER_FIELD.GEOMETRY_TYPE]: geometryType,
    [JOB_LAYER_FIELD.RENDER_CLASS]: getJobRenderClass(job),
  };
}

function createJobGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }

  if (geometry.type === JOB_GEOMETRY_TYPE.POINT) {
    return createPointGeometry(geometry);
  }

  if (geometry.type === JOB_GEOMETRY_TYPE.POLYGON) {
    return createPolygonGeometry(geometry);
  }

  return null;
}

function createPointGeometry(geometry) {
  const x = Number(geometry.longitude ?? geometry.x);
  const y = Number(geometry.latitude ?? geometry.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    type: JOB_GEOMETRY_TYPE.POINT,
    x,
    y,
    spatialReference: normalizeSpatialReference(geometry.spatialReference),
  };
}

function createPolygonGeometry(geometry) {
  if (!Array.isArray(geometry.rings)) {
    return null;
  }

  const rings = geometry.rings
    .map((ring) =>
      normalizeArray(ring)
        .map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    )
    .filter((ring) => ring.length >= 3);

  if (rings.length === 0) {
    return null;
  }

  return {
    type: JOB_GEOMETRY_TYPE.POLYGON,
    rings,
    spatialReference: normalizeSpatialReference(geometry.spatialReference),
  };
}

function normalizeSpatialReference(spatialReference) {
  if (!spatialReference || typeof spatialReference !== "object") {
    return {
      wkid: 4326,
    };
  }

  return {
    ...spatialReference,
  };
}

function formatDateForDisplay(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toISOString().slice(0, 10);
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}
