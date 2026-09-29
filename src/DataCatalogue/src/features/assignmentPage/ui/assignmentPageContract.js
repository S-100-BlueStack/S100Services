export const REQUIRED_ASSIGNMENT_PAGE_TARGETS = Object.freeze([
  "filter-form",
  "type",
  "status",
  "search",
  "list-status",
  "features",
  "feature-prev",
  "feature-page",
  "feature-next",
  "feature-retry",
  "selection-status",
  "selection-retry",
  "information",
  "work-stream-panel",
  "draft-status",
  "active-count",
  "work-stream-mode",
  "save",
  "save-error",
  "work-stream-status",
  "work-streams",
  "work-stream-retry",
  "map-retry",
  "map-empty",
  "map",
  "map-status",
  "fail-load",
  "fail-save",
  "reset",
  "test-status",
]);

export function createRequiredTargetGetter(findTarget) {
  const targets = new Map();
  const missing = [];

  for (const name of REQUIRED_ASSIGNMENT_PAGE_TARGETS) {
    const target = findTarget(name);
    if (target) targets.set(name, target);
    else missing.push(name);
  }

  if (missing.length) {
    throw new Error(`Assignment page is missing required render targets: ${missing.join(", ")}`);
  }

  return (name) => {
    if (!targets.has(name)) {
      throw new Error(`Assignment page render target is not declared: ${name}`);
    }
    return targets.get(name);
  };
}
