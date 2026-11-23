// Confirmed Workspace matches must remain distinct from both Package geometry and
// future unsaved match previews, which are planned as neutral dashed outlines.
export const ASSIGNMENT_SAVED_WORKSPACE_OUTLINE = Object.freeze({
  rgb: Object.freeze([245, 141, 35]),
  style: "solid",
  width: 2.8,
});

export function createAssignmentWorkspaceSymbol() {
  const { rgb, style, width } = ASSIGNMENT_SAVED_WORKSPACE_OUTLINE;
  return {
    type: "simple-fill",
    color: [...rgb, 0.065],
    outline: { color: [...rgb, 0.98], style, width },
  };
}
