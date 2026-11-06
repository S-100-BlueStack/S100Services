import {
  normalizeWorkspacePolygon,
  workspaceGeometryKey,
  workspaceGeometryContextKey,
} from "../../../shared/api/workspaceGeometry.js";

export function createWorkspaceGeometrySource({
  catalogue,
  concurrency = 4,
  requestTimeoutMs = 20_000,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6)
    throw new Error("Workspace geometry concurrency must be from 1 to 6.");
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0)
    throw new Error("Workspace geometry timeout must be positive.");
  const timeoutError = () =>
    new Error("Workspace geometry request timed out. Reload geometry to retry.");
  return {
    async load(workspaces, { signal } = {}) {
      const unique = new Map(
        workspaces.map((workspace) => [workspaceGeometryKey(workspace), workspace])
      );
      const items = [...unique.values()];
      const results = new Array(items.length);
      let index = 0;
      // No cross-selection cache: v1 has no geometry version/ETag or freshness guarantee.
      await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, async () => {
          while (index < items.length) {
            signal?.throwIfAborted();
            const position = index++;
            const workspace = items[position];
            const timeout = new AbortController();
            const timer = setTimeout(() => timeout.abort(), requestTimeoutMs);
            const readSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
            try {
              const detail = await catalogue.workspace(
                workspace.pipelineId,
                workspace.workspaceId,
                {
                  signal: readSignal,
                }
              );
              signal?.throwIfAborted();
              if (timeout.signal.aborted) throw timeoutError();
              if (workspaceGeometryKey(detail.workspace) !== workspaceGeometryKey(workspace))
                throw new Error("API returned a different Workspace identity.");
              if (
                workspace.geometryRef &&
                workspaceGeometryContextKey(workspace) !==
                  workspaceGeometryContextKey(detail.workspace)
              )
                throw new Error(
                  "Workspace geometry reference changed. Reload the Workspace or bindings."
                );
              results[position] = {
                workspace,
                polygon: normalizeWorkspacePolygon(detail.esriJSON),
                error: null,
              };
            } catch (error) {
              signal?.throwIfAborted();
              results[position] = {
                workspace,
                polygon: null,
                error: timeout.signal.aborted ? timeoutError() : error,
              };
            } finally {
              clearTimeout(timer);
            }
          }
        })
      );
      signal?.throwIfAborted();
      return results;
    },
  };
}
