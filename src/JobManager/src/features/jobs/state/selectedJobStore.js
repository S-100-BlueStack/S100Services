export function createSelectedJobStore() {
  let state = {
    selectedJob: null,
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      selectedJob: state.selectedJob
        ? { ...state.selectedJob, relatedAoiIds: [...state.selectedJob.relatedAoiIds] }
        : null,
    };
  }

  function selectJob(job) {
    const selectedJob = normalizeSelectedJob(job);

    state = {
      selectedJob,
    };

    emit();

    return selectedJob;
  }

  function clearSelection() {
    if (!state.selectedJob) {
      return;
    }

    state = {
      selectedJob: null,
    };

    emit();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    selectJob,
    clearSelection,
  };
}

export function normalizeSelectedJob(job = {}) {
  return {
    jobId: normalizeOptionalString(job.jobId ?? job.id),
    jobTitle: normalizeOptionalString(job.jobTitle ?? job.title) || "Selected Job",
    objectId: normalizeObjectId(job.objectId),
    geometryType: normalizeOptionalString(job.geometryType),
    priority: normalizeOptionalString(job.priority),
    relatedAoiIds: normalizeRelatedAoiIds(job.relatedAoiIds),
  };
}

function normalizeRelatedAoiIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeOptionalString).filter(Boolean))];
  }

  if (typeof value === "string") {
    return parseRelatedAoiIds(value);
  }

  return [];
}

function parseRelatedAoiIds(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedValue);

    if (Array.isArray(parsedValue)) {
      return normalizeRelatedAoiIds(parsedValue);
    }
  } catch {
    // Support older delimiter-based popup attributes while keeping JSON as the preferred format.
  }

  return [...new Set(trimmedValue.split("|").map(normalizeOptionalString).filter(Boolean))];
}

function normalizeObjectId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const objectId = Number(value);

  if (!Number.isInteger(objectId)) {
    return null;
  }

  return objectId;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
