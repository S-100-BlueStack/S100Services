import { workspaceGeometryKey } from "./workspaceGeometry.js";

const WORKSPACE_PAGE_SIZE = 20;
const PIPELINE_CONCURRENCY = 2;

// One bounded catalogue read supplies Main Map Workspace geometry and current membership.
export async function loadWorkspaceOverview(catalogue, { signal } = {}) {
  const pipelines = await catalogue.pipelines({ signal });
  signal?.throwIfAborted();
  if (new Set(pipelines.map((pipeline) => pipeline.id)).size !== pipelines.length)
    throw new Error("Workstream catalogue contains duplicate identifiers.");
  const pages = new Array(pipelines.length);
  let nextPipeline = 0;

  await Promise.all(
    Array.from({ length: Math.min(PIPELINE_CONCURRENCY, pipelines.length) }, async () => {
      while (nextPipeline < pipelines.length) {
        signal?.throwIfAborted();
        const index = nextPipeline++;
        const pipeline = pipelines[index];
        const rows = [];
        const seen = new Set();
        let total;
        for (let page = 0; ; page++) {
          signal?.throwIfAborted();
          const result = await catalogue.workspaceOverview({
            pipelineId: pipeline.id,
            page,
            pageSize: WORKSPACE_PAGE_SIZE,
            signal,
          });
          signal?.throwIfAborted();
          if (
            result.page !== page ||
            result.pageSize !== WORKSPACE_PAGE_SIZE ||
            (total !== undefined && result.total !== total)
          ) {
            throw new Error("Workspace overview changed during paging. Reload the catalogue.");
          }
          total = result.total;
          const expectedCount = Math.max(
            0,
            Math.min(WORKSPACE_PAGE_SIZE, total - page * WORKSPACE_PAGE_SIZE)
          );
          if (result.items.length !== expectedCount)
            throw new Error("Workspace overview paging returned an incomplete page.");
          for (const row of result.items) {
            if (row.workspace.pipelineId !== pipeline.id)
              throw new Error("Workspace overview contains a different Workstream identity.");
            const workspace = { ...row.workspace, pipelineName: pipeline.name };
            const key = workspaceGeometryKey(workspace);
            if (seen.has(key))
              throw new Error("Workspace overview contains a duplicate Workspace identity.");
            seen.add(key);
            rows.push({ ...row, workspace });
          }
          if (rows.length === total) break;
          if (!result.items.length || rows.length > total)
            throw new Error("Workspace overview paging did not return a complete catalogue.");
        }
        pages[index] = rows;
      }
    })
  );
  signal?.throwIfAborted();
  const entries = pages.flat();
  return {
    pipelines,
    workspaces: entries.map((entry) => entry.workspace),
    overview: new Map(entries.map((entry) => [workspaceGeometryKey(entry.workspace), entry])),
  };
}
