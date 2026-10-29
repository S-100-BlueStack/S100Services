export function createPipelineRow(pipeline, session) {
  const element = document.createElement("article");
  element.className = "dc-work-stream-row";
  const primary = document.createElement("label");
  primary.className = "dc-work-stream-row__selection";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const name = document.createElement("strong");
  name.textContent = pipeline.name;
  primary.append(checkbox, name);
  const derived = document.createElement("p");
  derived.className = "dc-assignment-muted";
  element.append(primary, derived);
  checkbox.addEventListener("change", () => session.setAssigned(pipeline.id, checkbox.checked));
  return {
    element,
    update(state) {
      checkbox.checked = state.draft.activeIds.includes(pipeline.id);
      checkbox.disabled = state.saving;
      const saved = state.record.relations[pipeline.id];
      const names = saved?.workspaces.map((workspace) => workspace.name) ?? [];
      derived.textContent = saved
        ? `Derived Workspaces (saved binding): ${names.length ? names.join(", ") : "No overlapping Workspaces"}${checkbox.checked ? "" : " · Removal pending"}`
        : checkbox.checked
          ? "Derived Workspaces will be resolved after Save."
          : "No saved binding.";
    },
  };
}
