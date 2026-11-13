// The list response contains direct Pipeline bindings, not derived Workspace membership.
export function normalizePackageAssignmentSummary(value) {
  const hasStatus = Object.hasOwn(value, "hasPipeline");
  const hasBindings = Object.hasOwn(value, "pipelineBindings");

  // Older servers must not silently turn unknown assignment state into Not assigned.
  if (!hasStatus && !hasBindings) return { status: null, pipelineIds: null };
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
      throw new Error("API returned invalid Package Pipeline bindings.");
    }
    seen.add(binding.pipelineId);
    pipelineIds.push(binding.pipelineId);
  }
  if (value.hasPipeline !== pipelineIds.length > 0) {
    throw new Error("API returned inconsistent Package assignment status.");
  }
  return {
    status: value.hasPipeline ? "Assigned" : "Not assigned",
    pipelineIds,
  };
}
