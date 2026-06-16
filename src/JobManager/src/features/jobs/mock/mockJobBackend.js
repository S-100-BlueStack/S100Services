import { cloneJob, normalizeJob } from "../domain/jobModel.js";
import { JOB_PRIORITY } from "../domain/jobPriority.js";
import { JOB_STATUS, normalizeJobStatus } from "../domain/jobStatus.js";
import {
  createInitialMockJobs,
  createPointGeometry,
  createPolygonGeometry,
} from "./mockJobData.js";

const DEFAULT_MOCK_CONFIG = Object.freeze({
  latencyMinMs: 250,
  latencyMaxMs: 1000,
  loadFailureRate: 0.05,
  mutationFailureRate: 0.15,
  cyclicJobCreationRate: 0.85,
});

let mockConfig = { ...DEFAULT_MOCK_CONFIG };
let jobs = createInitialMockJobs().map(normalizeJob);
let followUpJobCounter = 1;

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
    normalizedStatus === JOB_STATUS.DONE && shouldCreateFollowUpJob()
      ? [createFollowUpJob(updatedJob)]
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
  followUpJobCounter = 1;
}

function createFollowUpJob(sourceJob) {
  const createdAt = new Date();
  const deadline = new Date(createdAt);
  deadline.setUTCDate(deadline.getUTCDate() + 14);

  const followUpJob = normalizeJob({
    id: `job-follow-up-${String(followUpJobCounter).padStart(3, "0")}`,
    title: `Follow-up: ${sourceJob.title}`,
    summary: "Automatically created by the mock backend to simulate cyclic Job work.",
    createdAt: createdAt.toISOString(),
    deadline: deadline.toISOString(),
    priority: sourceJob.priority === JOB_PRIORITY.HIGH ? JOB_PRIORITY.MEDIUM : sourceJob.priority,
    status: JOB_STATUS.TODO,
    geometry: createFollowUpGeometry(sourceJob),
    relatedAoiIds: [...sourceJob.relatedAoiIds],
  });

  followUpJobCounter += 1;

  return followUpJob;
}

function createFollowUpGeometry(sourceJob) {
  if (sourceJob.geometry?.type === "polygon") {
    return sourceJob.geometry;
  }

  if (sourceJob.geometry?.type === "point") {
    const { longitude, latitude } = sourceJob.geometry;
    const offset = 0.18;

    return createPolygonGeometry([
      [longitude - offset, latitude - offset],
      [longitude + offset, latitude - offset],
      [longitude + offset, latitude + offset],
      [longitude - offset, latitude + offset],
      [longitude - offset, latitude - offset],
    ]);
  }

  return createPointGeometry(10.5, 56.0);
}

function shouldCreateFollowUpJob() {
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
