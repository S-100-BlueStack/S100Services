import { collectPages } from "../../../shared/api/catalogueService.js";
import { workspaceGeometryContextKey } from "../../../shared/api/workspaceGeometry.js";
import { compareSeverity } from "../../../shared/domain/severity.js";
import { loadLivePackageMetadata } from "./loadLivePackageMetadata.js";
import { createScopedJobStatusAdapter, scopedJobId } from "../mock/scopedJobStatusAdapter.js";

export function createLiveJobServiceAdapter({
  catalogue,
  statuses = createScopedJobStatusAdapter(),
  ensureWorkspaces = null,
}) {
  // Null means the catalogue has not loaded; [] means a verified empty catalogue.
  let scopes = null;
  let jobs = new Map();
  let pendingOverview = null;
  let loadGeneration = 0;

  function setWorkspaces(workspaces, { overview = null } = {}) {
    if (!Array.isArray(workspaces)) throw new Error("Workspaces must be an array.");
    const unique = new Map();
    for (const workspace of workspaces) {
      if (!workspace?.pipelineId || !workspace?.workspaceId)
        throw new Error("Workspace selection contains an invalid identity.");
      unique.set(
        JSON.stringify([workspace.pipelineId, workspace.workspaceId]),
        structuredClone(workspace)
      );
    }
    if (overview !== null && !(overview instanceof Map))
      throw new Error("Workspace overview must be a scoped Map.");
    scopes = [...unique.values()];
    pendingOverview = overview;
    loadGeneration++;
    jobs = new Map();
  }

  return {
    source: "live",
    setWorkspaces,
    // Compatible with the original Workspace-scoped adapter callers.
    setScope(value) {
      setWorkspaces(value ? [value] : []);
    },
    async loadJobs({ signal } = {}) {
      if (scopes === null) {
        if (typeof ensureWorkspaces !== "function") {
          throw new Error(
            "Workspace catalogue has not loaded. Retry Packages when it is available."
          );
        }
        const prerequisite = await ensureWorkspaces();
        signal?.throwIfAborted();
        if (!prerequisite?.ok) {
          throw prerequisite?.error ?? new Error("Workspace catalogue could not be loaded.");
        }
        if (scopes === null) {
          throw new Error("Workspace catalogue did not provide an authoritative Package scope.");
        }
      }
      const selected = scopes;
      const overview = pendingOverview;
      // A snapshot is a single initial read, not a persistent membership cache. Manual
      // refreshes must re-read the current Workspace membership from the API.
      pendingOverview = null;
      const currentLoad = ++loadGeneration;
      if (!selected.length) return { jobs: [] };
      const memberships = [];
      let scopeIndex = 0;
      // Only missing/overflowing memberships need legacy reads; bound those requests.
      await Promise.all(
        Array.from({ length: Math.min(4, selected.length) }, async () => {
          while (scopeIndex < selected.length) {
            signal?.throwIfAborted();
            const workspace = selected[scopeIndex++];
            const entry = overview?.get(
              JSON.stringify([workspace.pipelineId, workspace.workspaceId])
            );
            if (overview && !entry)
              throw new Error("Workspace overview does not include the current Workspace.");
            if (
              entry &&
              workspaceGeometryContextKey(entry.workspace) !==
                workspaceGeometryContextKey(workspace)
            ) {
              throw new Error("Workspace overview identity changed. Reload the catalogue.");
            }
            const members = await collectPages(
              (options) =>
                catalogue.workspacePackages(workspace.pipelineId, workspace.workspaceId, options),
              { signal, initialPage: entry?.packages ?? null }
            );
            for (const member of members) memberships.push({ workspace, member });
          }
        })
      );
      signal?.throwIfAborted();
      const packageIds = memberships.map(({ member }) => member.packageId);
      const packages = await loadLivePackageMetadata(catalogue, packageIds, { signal });
      signal?.throwIfAborted();
      const loaded = memberships.map(({ member, workspace }) => {
        const item = packages.get(member.packageId);
        const context = {
          packageId: item.id,
          pipelineId: workspace.pipelineId,
          workspaceId: workspace.workspaceId,
        };
        return {
          ...item,
          ...context,
          id: scopedJobId(context),
          source: "live",
          shortId: member.shortId ?? item.shortId,
          packageTitle: item.title ?? null,
          title: `${member.shortId || item.name} · ${item.title}`,
          summary: `${workspace.pipelineName} / ${workspace.name}`,
          pipelineName: workspace.pipelineName,
          workspaceName: workspace.name,
          status: statuses.get(context),
          statusSource: "mock",
          priority: null,
          deadline: null,
          geometry: null,
          relatedAoiIds: [],
        };
      });
      loaded.sort((a, b) => compareSeverity(a.severity, b.severity) || a.id.localeCompare(b.id));
      if (scopes === selected && currentLoad === loadGeneration)
        jobs = new Map(loaded.map((job) => [job.id, job]));
      return { jobs: loaded };
    },
    async updateJobStatus(id, status) {
      const job = jobs.get(id);
      if (!job)
        throw new Error(
          "Package is no longer in the loaded Workspace catalogue. Refresh Packages before updating status."
        );
      const next = { ...job, status: statuses.set(job, status) };
      jobs.set(id, next);
      return { job: next, createdJobs: [], statusSource: "mock" };
    },
    resetStatuses() {
      statuses.reset();
      jobs = new Map([...jobs].map(([id, job]) => [id, { ...job, status: statuses.get(job) }]));
    },
  };
}
