import { isActiveJobStatus } from "./jobStatus.js";

// The same Pipeline/Workspace identity must be used by the list and map scope.
export function packageWorkspaceKey({ pipelineId, workspaceId } = {}) {
  return JSON.stringify([pipelineId, workspaceId]);
}

export function normalizePackageScope(scope) {
  if (!scope) return null;
  if (Array.isArray(scope.pipelineIds)) {
    return {
      pipelineIds: [
        ...new Set(scope.pipelineIds.filter((id) => typeof id === "string" && id.trim())),
      ],
      workspaceKeys: Array.isArray(scope.workspaceKeys)
        ? [...new Set(scope.workspaceKeys.filter((key) => typeof key === "string" && key.trim()))]
        : null,
      showEmptyWorkspaces: Boolean(scope.showEmptyWorkspaces),
    };
  }
  // Retain the earlier single-Pipeline contract for contextual callers.
  return {
    pipelineIds: scope.pipelineId ? [scope.pipelineId] : [],
    workspaceKeys: scope.workspaceId
      ? [packageWorkspaceKey({ pipelineId: scope.pipelineId, workspaceId: scope.workspaceId })]
      : null,
    showEmptyWorkspaces: Boolean(scope.showEmptyWorkspaces),
  };
}

export function filterJobsByPackageScope(jobs = [], scope) {
  const normalized = normalizePackageScope(scope);
  if (normalized === null) return jobs;
  const pipelines = new Set(normalized.pipelineIds);
  const workspaces = normalized.workspaceKeys === null ? null : new Set(normalized.workspaceKeys);
  return jobs.filter(
    (job) =>
      pipelines.has(job.pipelineId) && (!workspaces || workspaces.has(packageWorkspaceKey(job)))
  );
}

// The paged Pipeline geometry response includes Packages with no Workspace
// intersection. Only the contextual Job catalogue proves membership.
export function getVisiblePackageIdsForScope(jobs = [], scope) {
  return [
    ...new Set(
      filterJobsByPackageScope(jobs, scope)
        .map((job) => job.packageId)
        .filter((id) => typeof id === "string" && id.trim())
    ),
  ];
}

export function filterWorkspacesByPackageScope(workspaces = [], scope, openJobCounts = null) {
  const normalized = normalizePackageScope(scope);
  if (normalized === null) return workspaces;
  const pipelines = new Set(normalized.pipelineIds);
  const selected = normalized.workspaceKeys === null ? null : new Set(normalized.workspaceKeys);
  return workspaces.filter(
    (workspace) =>
      pipelines.has(workspace.pipelineId) &&
      (!selected || selected.has(packageWorkspaceKey(workspace))) &&
      (normalized.showEmptyWorkspaces ||
        !(openJobCounts instanceof Map) ||
        selected?.has(packageWorkspaceKey(workspace)) ||
        (openJobCounts.get(packageWorkspaceKey(workspace)) ?? 0) > 0)
  );
}

export function countOpenJobsByWorkspace(jobs = []) {
  const counts = new Map();
  const seen = new Set();
  for (const job of jobs) {
    if (!job?.id || !job?.pipelineId || !job?.workspaceId) continue;
    const key = packageWorkspaceKey(job);
    const identity = JSON.stringify([key, job.id]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (isActiveJobStatus(job.status)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function groupJobsByPackage(jobs = []) {
  const groups = new Map();
  for (const job of jobs) {
    // An incomplete identity must never merge unrelated contextual Jobs.
    const key =
      job?.source === "live" && job.packageId ? `package:${job.packageId}` : `job:${job.id}`;
    if (!groups.has(key)) groups.set(key, { key, jobs: [] });
    groups.get(key).jobs.push(job);
  }
  return [...groups.values()];
}
