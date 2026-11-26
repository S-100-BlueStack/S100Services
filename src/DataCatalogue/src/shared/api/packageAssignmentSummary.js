import { PACKAGE_STATUS_LABELS } from "./packageComments.js";

// The list response contains direct Pipeline bindings, not derived Workspace membership.
export function normalizePackageAssignmentSummary(value) {
  const hasStatus = Object.hasOwn(value, "hasPipeline");
  const hasBindings = Object.hasOwn(value, "pipelineBindings");

  // Older servers must not silently turn unknown assignment state into Not assigned.
  if (!hasStatus && !hasBindings && !Object.hasOwn(value, "assignmentStatus")) {
    return { status: null, pipelineIds: null };
  }
  if (typeof value.hasPipeline !== "boolean" || !Array.isArray(value.pipelineBindings)) {
    throw new Error("API returned an incomplete Package assignment summary.");
  }

  const pipelineIds = [];
  const seen = new Set();
  for (const binding of value.pipelineBindings) {
    if (
      !binding ||
      typeof binding.id !== "string" ||
      !binding.id.trim() ||
      typeof binding.pipelineId !== "string" ||
      !binding.pipelineId.trim() ||
      seen.has(binding.pipelineId)
    ) {
      throw new Error("API returned invalid Package Workstream bindings.");
    }
    seen.add(binding.pipelineId);
    pipelineIds.push(binding.pipelineId);
  }
  if (value.hasPipeline !== pipelineIds.length > 0) {
    throw new Error("API returned inconsistent Package assignment status.");
  }
  const assignmentStatus = Object.hasOwn(value, "assignmentStatus") ? value.assignmentStatus : null;
  if (
    Object.hasOwn(value, "assignmentStatus") &&
    (!Object.hasOwn(PACKAGE_STATUS_LABELS, assignmentStatus) ||
      (assignmentStatus === "assigned") !== value.hasPipeline)
  ) {
    throw new Error("API returned inconsistent Package assignment status.");
  }
  return {
    status: assignmentStatus
      ? PACKAGE_STATUS_LABELS[assignmentStatus]
      : value.hasPipeline
        ? "Assigned"
        : null,
    ...(assignmentStatus ? { assignmentStatus } : {}),
    pipelineIds,
  };
}
