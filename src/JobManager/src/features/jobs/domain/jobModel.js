import { normalizeJobPriority } from "./jobPriority.js";
import { normalizeJobStatus } from "./jobStatus.js";

const WGS84_SPATIAL_REFERENCE = Object.freeze({
  wkid: 4326,
});

export function normalizeJob(rawJob) {
  const geometry = normalizeJobGeometry(rawJob.geometry);

  return {
    id: String(rawJob.id),
    title: String(rawJob.title || "Untitled Job"),
    summary: String(rawJob.summary || ""),
    createdAt: normalizeDateString(rawJob.createdAt, new Date().toISOString()),
    deadline: rawJob.deadline ? normalizeDateString(rawJob.deadline, null) : null,
    priority: normalizeJobPriority(rawJob.priority),
    status: normalizeJobStatus(rawJob.status),
    geometry,
    relatedAoiIds: normalizeStringArray(rawJob.relatedAoiIds),
  };
}

export function cloneJob(job) {
  return normalizeJob({
    ...job,
    geometry: cloneGeometry(job.geometry),
    relatedAoiIds: [...job.relatedAoiIds],
  });
}

export function getJobGeometryTypeLabel(job) {
  switch (job.geometry?.type) {
    case "point":
      return "Point";
    case "polygon":
      return "Polygon";
    default:
      return "Unknown geometry";
  }
}

function normalizeDateString(value, fallback) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function normalizeJobGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }

  if (geometry.type === "point") {
    return normalizePointGeometry(geometry);
  }

  if (geometry.type === "polygon") {
    return normalizePolygonGeometry(geometry);
  }

  return null;
}

function normalizePointGeometry(geometry) {
  const longitude = Number(geometry.longitude ?? geometry.x);
  const latitude = Number(geometry.latitude ?? geometry.y);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return {
    type: "point",
    longitude,
    latitude,
    spatialReference: geometry.spatialReference ?? WGS84_SPATIAL_REFERENCE,
  };
}

function normalizePolygonGeometry(geometry) {
  if (!Array.isArray(geometry.rings)) {
    return null;
  }

  return {
    type: "polygon",
    rings: geometry.rings.map((ring) =>
      ring.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])])
    ),
    spatialReference: geometry.spatialReference ?? WGS84_SPATIAL_REFERENCE,
  };
}

function cloneGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "point") {
    return {
      ...geometry,
      spatialReference: { ...geometry.spatialReference },
    };
  }

  if (geometry.type === "polygon") {
    return {
      ...geometry,
      rings: geometry.rings.map((ring) => ring.map((coordinate) => [...coordinate])),
      spatialReference: { ...geometry.spatialReference },
    };
  }

  return null;
}
