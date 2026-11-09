// A manual choice is only a draft delta against backend-calculated Workspace membership.
// Backend owns the effective membership; this module never manufactures a saved relation.
export const WORKSPACE_PREVIEW_UNSAVED_MESSAGE =
  "Workspace edits are preview-only. Reset Workspace edits before saving Pipeline bindings; the current API cannot save manual Workspace changes.";

export function savedWorkspaceSelected(record, pipelineId, workspaceId) {
  return Boolean(
    record?.relations?.[pipelineId]?.workspaces?.some((item) => item.id === workspaceId)
  );
}

export function workspacePreviewSelection(record, draft, pipelineId, workspaceId) {
  const automatic = savedWorkspaceSelected(record, pipelineId, workspaceId);
  const changes = draft?.workspaceOverrides ?? {};
  const pipelineChanges = Object.hasOwn(changes, pipelineId) ? changes[pipelineId] : {};
  const choice = Object.hasOwn(pipelineChanges, workspaceId)
    ? pipelineChanges[workspaceId]
    : undefined;
  return { automatic, selected: typeof choice === "boolean" ? choice : automatic };
}

export function withWorkspacePreviewSelection(record, draft, pipelineId, workspaceId, selected) {
  const existing = Object.entries(draft?.workspaceOverrides ?? {});
  const current = existing.find(([id]) => id === pipelineId)?.[1] ?? {};
  const automatic = savedWorkspaceSelected(record, pipelineId, workspaceId);
  const next = Object.entries(current).filter(([id]) => id !== workspaceId);
  if (selected !== automatic) next.push([workspaceId, selected]);
  const pipelines = existing.filter(([id]) => id !== pipelineId);
  if (next.length) pipelines.push([pipelineId, Object.fromEntries(next)]);
  // Object.fromEntries preserves identifiers such as "__proto__" as ordinary own keys.
  return Object.fromEntries(pipelines);
}

export function workspacePreviewChangeCount(draft, pipelineId = null) {
  const changes = draft?.workspaceOverrides ?? {};
  return Object.entries(changes).reduce(
    (count, [id, values]) =>
      count + (pipelineId === null || pipelineId === id ? Object.keys(values).length : 0),
    0
  );
}
