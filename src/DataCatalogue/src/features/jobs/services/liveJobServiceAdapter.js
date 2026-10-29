import { collectPages } from "../../../shared/api/catalogueService.js";
import { compareSeverity } from "../../../shared/domain/severity.js";
import { createScopedJobStatusAdapter, scopedJobId } from "../mock/scopedJobStatusAdapter.js";

export function createLiveJobServiceAdapter({
  catalogue,
  statuses = createScopedJobStatusAdapter(),
}) {
  let scope = null;
  let jobs = new Map();
  return {
    source: "live",
    setScope(value) {
      scope = value ? structuredClone(value) : null;
      jobs = new Map();
    },
    async loadJobs({ signal } = {}) {
      const selected = scope;
      if (!selected) return { jobs: [] };
      const members = await collectPages(
        (options) =>
          catalogue.workspacePackages(selected.pipelineId, selected.workspaceId, options),
        { signal }
      );
      const loaded = [];
      // Bound hydration concurrency and publish only a complete selected Workspace snapshot.
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(6, members.length) }, async () => {
          while (index < members.length) {
            signal?.throwIfAborted();
            const member = members[index++];
            const item = await catalogue.package(member.packageId, { signal });
            if (item.id !== member.packageId)
              throw new Error("Package identity does not match the Workspace member.");
            const context = {
              packageId: item.id,
              pipelineId: selected.pipelineId,
              workspaceId: selected.workspaceId,
            };
            loaded.push({
              ...item,
              ...context,
              id: scopedJobId(context),
              source: "live",
              shortId: member.shortId ?? item.shortId,
              title: `${member.shortId || item.name} · ${item.title}`,
              summary: `${selected.pipelineName} / ${selected.name}`,
              pipelineName: selected.pipelineName,
              workspaceName: selected.name,
              status: statuses.get(context),
              statusSource: "mock",
              priority: null,
              deadline: null,
              geometry: null,
              relatedAoiIds: [],
            });
          }
        })
      );
      signal?.throwIfAborted();
      for (const job of loaded) job.status = statuses.get(job);
      loaded.sort((a, b) => compareSeverity(a.severity, b.severity) || a.id.localeCompare(b.id));
      if (scope === selected) jobs = new Map(loaded.map((job) => [job.id, job]));
      return { jobs: loaded };
    },
    async updateJobStatus(id, status) {
      const job = jobs.get(id);
      if (!job)
        throw new Error("Job is outside the current Workspace. Reload before updating status.");
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
