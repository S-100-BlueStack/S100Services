import { isActiveJobStatus } from "../../jobs/domain/jobStatus.js";
import { workspaceSelectionKey } from "./pipelineVisibility.js";

// Configuration: threshold lower bounds are inclusive, evaluated from highest to lowest.
export const WORKSPACE_JOB_COLOR_LEVELS = Object.freeze([
  { minOpenJobs: 0, label: "0 open", css: "#268a5b", rgb: [38, 138, 91] },
  { minOpenJobs: 1, label: "1–2 open", css: "#e2ba23", rgb: [226, 186, 35] },
  { minOpenJobs: 3, label: "3–4 open", css: "#df8126", rgb: [223, 129, 38] },
  { minOpenJobs: 5, label: "5+ open", css: "#c73a44", rgb: [199, 58, 68] },
]);

export const UNKNOWN_WORKSPACE_COLOR = Object.freeze([0, 150, 220]);

export function workspaceColorForOpenJobs(count) {
  if (!Number.isSafeInteger(count) || count < 0) return UNKNOWN_WORKSPACE_COLOR;
  for (let i = WORKSPACE_JOB_COLOR_LEVELS.length - 1; i >= 0; i--) {
    const level = WORKSPACE_JOB_COLOR_LEVELS[i];
    if (count >= level.minOpenJobs) return level.rgb;
  }
  return UNKNOWN_WORKSPACE_COLOR;
}

export function countOpenJobsByWorkspace(jobs) {
  const counts = new Map();
  const seen = new Map();
  for (const job of jobs) {
    if (!job?.pipelineId || !job?.workspaceId || !job?.id) continue;
    const key = workspaceSelectionKey(job);
    if (!seen.has(key)) seen.set(key, new Set());
    if (seen.get(key).has(job.id)) continue;
    seen.get(key).add(job.id);
    if (isActiveJobStatus(job.status)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
