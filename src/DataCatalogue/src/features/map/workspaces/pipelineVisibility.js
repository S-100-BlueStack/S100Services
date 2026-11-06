export function workspaceSelectionKey(workspace) {
  return JSON.stringify([workspace.pipelineId, workspace.workspaceId]);
}

export function groupWorkspacePipelines(workspaces, pipelines = []) {
  const groups = new Map(
    pipelines.map((pipeline) => [
      pipeline.id,
      { id: pipeline.id, name: pipeline.name || pipeline.id, workspaces: [] },
    ])
  );
  for (const workspace of workspaces) {
    if (!workspace?.pipelineId || !workspace?.workspaceId) {
      throw new Error("Workspace listing contains an invalid identity.");
    }
    const pipelineId = workspace.pipelineId;
    if (!groups.has(pipelineId)) {
      groups.set(pipelineId, {
        id: pipelineId,
        name: workspace.pipelineName || pipelineId,
        workspaces: [],
      });
    }
    groups.get(pipelineId).workspaces.push(workspace);
  }
  const compare = (a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
    a.id.localeCompare(b.id);
  return [...groups.values()].sort(compare).map((group) => ({
    ...group,
    workspaces: [...group.workspaces].sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
        a.workspaceId.localeCompare(b.workspaceId)
    ),
  }));
}

export function visibleWorkspacePipelines(groups, enabledPipelineIds, enabledWorkspaceKeys = null) {
  const enabled = new Set(enabledPipelineIds);
  const enabledWorkspaces = enabledWorkspaceKeys === null ? null : new Set(enabledWorkspaceKeys);
  return groups
    .filter((group) => enabled.has(group.id))
    .flatMap((group) => group.workspaces)
    .filter(
      (workspace) => !enabledWorkspaces || enabledWorkspaces.has(workspaceSelectionKey(workspace))
    );
}

export function preservePipelineSelection(groups, previousGroups, previousSelection) {
  const previousIds = new Set(previousGroups.map((group) => group.id));
  const selected = new Set(previousSelection);
  return groups
    .filter((group) => !previousIds.has(group.id) || selected.has(group.id))
    .map((group) => group.id);
}

export function preserveWorkspaceSelection(groups, previousGroups, previousSelection) {
  const oldKeys = new Set(
    previousGroups.flatMap((group) => group.workspaces.map(workspaceSelectionKey))
  );
  const selected = new Set(previousSelection);
  return groups
    .flatMap((group) => group.workspaces)
    .filter(
      (workspace) =>
        !oldKeys.has(workspaceSelectionKey(workspace)) ||
        selected.has(workspaceSelectionKey(workspace))
    )
    .map(workspaceSelectionKey);
}
