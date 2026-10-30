import { workspaceGeometryKey } from "../../../shared/api/workspaceGeometry.js";

export function liveAssignmentMapContext(feature, record) {
  const workspaces = new Map();
  if (feature) {
    // Draft checkboxes cannot predict membership; only reconciled backend bindings are geography.
    for (const [pipelineId, relation] of Object.entries(record?.relations ?? {})) {
      if (!relation.active) continue;
      for (const workspace of relation.workspaces ?? []) {
        if (workspace.pipelineId !== pipelineId)
          throw new Error("Workspace does not belong to its saved Pipeline binding.");
        workspaces.set(workspaceGeometryKey(workspace), workspace);
      }
    }
  }
  return { id: feature?.packageId ?? feature?.id ?? null, workspaces: [...workspaces.values()] };
}
