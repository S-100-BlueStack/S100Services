import { cloneJob, normalizeJob } from "../domain/jobModel.js";
import { JOB_PRIORITY } from "../domain/jobPriority.js";
import { JOB_STATUS, normalizeJobStatus } from "../domain/jobStatus.js";
import {
  createInitialMockJobs,
  createPointGeometry,
  createRectanglePolygonGeometry,
} from "./mockJobData.js";

const DEFAULT_MOCK_CONFIG = Object.freeze({
  latencyMinMs: 250,
  latencyMaxMs: 1000,
  loadFailureRate: 0.05,
  mutationFailureRate: 0.15,
  cyclicJobCreationRate: 0.85,
});

const GENERATED_JOB_TEMPLATES = Object.freeze([
  {
    title: "Review Baltic Sea source update",
    summary:
      "Assess a new source update east of Denmark and decide whether nearby AOIs require work.",
    priority: JOB_PRIORITY.HIGH,
    deadlineDaysFromNow: 9,
    geometry: createRectanglePolygonGeometry([13.5, 55.0], [0.3, 0.2]),
    relatedAoiIds: ["mock-aoi-baltic-sea", "mock-aoi-eastern-denmark"],
  },
  {
    title: "Validate Sound data report",
    summary:
      "Review reported data changes in the Sound and prepare follow-up if AOIs are affected.",
    priority: JOB_PRIORITY.MEDIUM,
    deadlineDaysFromNow: 12,
    geometry: createPointGeometry(12.62, 55.78),
    relatedAoiIds: ["mock-aoi-sound"],
  },
  {
    title: "Inspect Wadden Sea update",
    summary: "Check whether new Wadden Sea information affects current AOI coverage.",
    priority: JOB_PRIORITY.LOW,
    deadlineDaysFromNow: 18,
    geometry: createRectanglePolygonGeometry([8.3, 55.05], [0.24, 0.18]),
    relatedAoiIds: ["mock-aoi-wadden-sea"],
  },
  {
    title: "Assess Fehmarn Belt update",
    summary: "Determine whether the Fehmarn Belt update introduces work for nearby AOIs.",
    priority: JOB_PRIORITY.MEDIUM,
    deadlineDaysFromNow: 14,
    geometry: createRectanglePolygonGeometry([11.35, 54.7], [0.3, 0.18]),
    relatedAoiIds: ["mock-aoi-fehmarn-belt", "mock-aoi-danish-straits"],
  },
]);

let mockConfig = { ...DEFAULT_MOCK_CONFIG };
let jobs = createInitialMockJobs().map(normalizeJob);
let generatedJobCounter = 1;

export async function loadMockJobs() {
  await simulateLatency();
  maybeFail(mockConfig.loadFailureRate, "Mock Jobs could not be loaded.");

  return jobs.map(cloneJob);
}

export async function updateMockJobStatus(jobId, nextStatus) {
  await simulateLatency();
  maybeFail(mockConfig.mutationFailureRate, "Mock Job status update failed.");

  const normalizedStatus = normalizeJobStatus(nextStatus);
  const jobIndex = jobs.findIndex((job) => job.id === jobId);

  if (jobIndex < 0) {
    throw createMockBackendError(`Job was not found: ${jobId}`);
  }

  const updatedJob = normalizeJob({
    ...jobs[jobIndex],
    status: normalizedStatus,
  });

  jobs = [...jobs.slice(0, jobIndex), updatedJob, ...jobs.slice(jobIndex + 1)];

  const createdJobs =
    normalizedStatus === JOB_STATUS.DONE && shouldCreateGeneratedJob()
      ? [createGeneratedJob(updatedJob)]
      : [];

  if (createdJobs.length > 0) {
    jobs = [...createdJobs, ...jobs];
  }

  return {
    job: cloneJob(updatedJob),
    createdJobs: createdJobs.map(cloneJob),
  };
}

export function configureMockJobBackend(nextConfig) {
  mockConfig = {
    ...mockConfig,
    ...nextConfig,
  };
}

export function resetMockJobBackend() {
  mockConfig = { ...DEFAULT_MOCK_CONFIG };
  jobs = createInitialMockJobs().map(normalizeJob);
  generatedJobCounter = 1;
}

function createGeneratedJob(sourceJob) {
  if (Math.random() < 0.5) {
    return createFollowUpJob(sourceJob);
  }

  return createSeparateJob();
}

function createFollowUpJob(sourceJob) {
  const createdAt = new Date();
  const deadline = createDeadlineDate(createdAt, 14);

  const generatedJob = normalizeJob({
    id: createGeneratedJobId(),
    title: `Follow-up: ${sourceJob.title}`,
    summary: "Automatically created by the mock backend to simulate cyclic Job work.",
    createdAt: createdAt.toISOString(),
    deadline: deadline.toISOString(),
    priority: sourceJob.priority === JOB_PRIORITY.HIGH ? JOB_PRIORITY.MEDIUM : sourceJob.priority,
    status: JOB_STATUS.TODO,
    geometry: createFollowUpGeometry(sourceJob),
    relatedAoiIds: [...sourceJob.relatedAoiIds],
  });

  return generatedJob;
}

function createSeparateJob() {
  const template = getNextSeparateJobTemplate();
  const createdAt = new Date();
  const deadline = createDeadlineDate(createdAt, template.deadlineDaysFromNow);

  return normalizeJob({
    id: createGeneratedJobId(),
    title: template.title,
    summary: template.summary,
    createdAt: createdAt.toISOString(),
    deadline: deadline.toISOString(),
    priority: template.priority,
    status: JOB_STATUS.TODO,
    geometry: template.geometry,
    relatedAoiIds: [...template.relatedAoiIds],
  });
}

function getNextSeparateJobTemplate() {
  const templateIndex = (generatedJobCounter - 1) % GENERATED_JOB_TEMPLATES.length;

  return GENERATED_JOB_TEMPLATES[templateIndex];
}

function createGeneratedJobId() {
  const id = `job-generated-${String(generatedJobCounter).padStart(3, "0")}`;
  generatedJobCounter += 1;

  return id;
}

function createFollowUpGeometry(sourceJob) {
  if (sourceJob.geometry?.type === "polygon") {
    return sourceJob.geometry;
  }

  if (sourceJob.geometry?.type === "point") {
    const { longitude, latitude } = sourceJob.geometry;

    return createRectanglePolygonGeometry([longitude, latitude], [0.16, 0.16]);
  }

  return createPointGeometry(10.5, 56.0);
}

function createDeadlineDate(createdAt, daysFromNow) {
  const deadline = new Date(createdAt);
  deadline.setUTCDate(deadline.getUTCDate() + daysFromNow);
  deadline.setUTCHours(9, 0, 0, 0);

  return deadline;
}

function shouldCreateGeneratedJob() {
  return Math.random() < mockConfig.cyclicJobCreationRate;
}

function maybeFail(failureRate, message) {
  if (Math.random() >= failureRate) {
    return;
  }

  throw createMockBackendError(message);
}

function createMockBackendError(message) {
  return {
    name: "MockBackendError",
    message,
    userMessage: message,
    status: 503,
    code: "MOCK_BACKEND_FAILURE",
  };
}

async function simulateLatency() {
  const latencyMs =
    mockConfig.latencyMinMs + Math.random() * (mockConfig.latencyMaxMs - mockConfig.latencyMinMs);

  await new Promise((resolve) => {
    window.setTimeout(resolve, latencyMs);
  });
}
