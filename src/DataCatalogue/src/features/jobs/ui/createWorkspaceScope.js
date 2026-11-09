import { collectPages } from "../../../shared/api/catalogueService.js";

export function createWorkspaceScope({ catalogue, adapter, store, onScopeChange, onFocus }) {
  const element = document.createElement("div");
  element.className = "dc-workspace-scope dc-assignment-toolbar";
  const label = document.createElement("label");
  label.textContent = "Workspace";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Pipeline and Workspace for Packages");
  select.append(new Option("Select a Workspace", ""));
  label.append(select);
  const focus = document.createElement("button");
  focus.type = "button";
  focus.textContent = "Focus Workspace";
  focus.disabled = true;
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload Workspaces";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  element.append(label, focus, reload, message);
  let workspaces = [];
  let alive = true;
  let generation = 0;
  let request = null;

  function applyScope(options) {
    const selected = workspaces.find((workspace) => workspace.key === select.value) ?? null;
    adapter.setScope(selected);
    focus.disabled = !selected;
    onScopeChange(selected, options);
    void store.loadJobs({ clear: true });
  }

  async function load() {
    const current = ++generation;
    request?.abort();
    request = new AbortController();
    select.disabled = true;
    message.textContent = "Loading Workspaces…";
    try {
      const next = await collectPages(catalogue.workspaces, { signal: request.signal });
      if (!alive || current !== generation) return;
      const previous = select.value;
      workspaces = next;
      const groups = new Map();
      select.replaceChildren(new Option("Select a Workspace", ""));
      for (const workspace of workspaces) {
        let group = groups.get(workspace.pipelineId);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = workspace.pipelineName;
          groups.set(workspace.pipelineId, group);
          select.append(group);
        }
        group.append(new Option(workspace.name, workspace.key));
      }
      select.value = workspaces.some((workspace) => workspace.key === previous) ? previous : "";
      if (previous) applyScope({ reload: true, autoFocus: false });
      message.textContent = "";
    } catch (error) {
      if (alive && current === generation) {
        message.textContent = `Workspaces unavailable: ${error.message}`;
        workspaces = [];
        select.replaceChildren(new Option("Workspaces unavailable", ""));
        applyScope();
      }
    } finally {
      if (alive && current === generation) select.disabled = false;
    }
  }
  select.addEventListener("change", () => applyScope());
  focus.addEventListener("click", () => onFocus?.());
  reload.addEventListener("click", () => void load());
  void load();
  return {
    element,
    destroy() {
      alive = false;
      generation++;
      request?.abort();
      element.remove();
    },
  };
}
