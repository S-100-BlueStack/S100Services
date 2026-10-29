import { collectPages } from "../../../shared/api/catalogueService.js";

export function createWorkspaceScope({ catalogue, adapter, store, onScopeChange }) {
  const element = document.createElement("div");
  element.className = "dc-workspace-scope dc-assignment-toolbar";
  const label = document.createElement("label");
  label.textContent = "Workspace";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Pipeline and Workspace for Jobs");
  select.append(new Option("Select a Workspace", ""));
  label.append(select);
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload Workspaces";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset mock statuses";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  element.append(label, reload, reset, message);
  let workspaces = [];
  let alive = true;
  let generation = 0;
  let request = null;

  function applyScope() {
    const selected = workspaces.find((workspace) => workspace.key === select.value) ?? null;
    adapter.setScope(selected);
    onScopeChange();
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
      if (previous) applyScope();
      message.textContent = `${workspaces.length} Workspaces. Jobs and filters cover only the selected Workspace. Status is simulated in memory and is never saved to the API.`;
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
  select.addEventListener("change", applyScope);
  reload.addEventListener("click", () => void load());
  reset.addEventListener("click", () => {
    adapter.resetStatuses();
    void store.loadJobs({ clear: true });
  });
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
