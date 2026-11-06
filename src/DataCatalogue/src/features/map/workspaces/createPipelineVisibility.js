import { collectPages } from "../../../shared/api/catalogueService.js";
import { WORKSPACE_JOB_COLOR_LEVELS } from "./workspaceJobColors.js";
import {
  groupWorkspacePipelines,
  preservePipelineSelection,
  preserveWorkspaceSelection,
  visibleWorkspacePipelines,
  workspaceSelectionKey,
} from "./pipelineVisibility.js";

export function createPipelineVisibility({ catalogue, container, onChange, onWorkspacesLoaded }) {
  const list = document.createElement("div");
  list.className = "dc-pipeline-list";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", "Visible Pipelines and Workspaces");
  const message = document.createElement("p");
  message.className = "dc-pipeline-message";
  message.setAttribute("role", "status");
  const legend = document.createElement("div");
  legend.className = "dc-workspace-status-legend";
  legend.setAttribute("aria-label", "Workspace open Job counts");
  for (const item of WORKSPACE_JOB_COLOR_LEVELS) {
    const entry = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.style.backgroundColor = item.css;
    swatch.setAttribute("aria-hidden", "true");
    entry.append(swatch, document.createTextNode(item.label));
    legend.append(entry);
  }
  container.append(message, list, legend);

  let groups = [];
  let enabledPipelines = new Set();
  let enabledWorkspaces = new Set();
  let alive = true;
  let generation = 0;
  let request = null;
  let loaded = false;
  let pending = null;

  function visible() {
    return visibleWorkspacePipelines(groups, enabledPipelines, enabledWorkspaces);
  }

  function notify(options = {}) {
    onChange(visible(), options);
  }

  function updateMessage() {
    message.textContent = groups.length
      ? `${enabledPipelines.size} / ${groups.length} Pipelines · ${visible().length} Workspaces visible`
      : "No Workspaces available.";
  }

  function render() {
    const nodes = groups.map((group) => {
      const region = document.createElement("div");
      region.className = "dc-pipeline-group";
      const label = document.createElement("label");
      label.className = "dc-pipeline-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = enabledPipelines.has(group.id);
      input.value = group.id;
      input.setAttribute("aria-label", `Show ${group.name} Pipeline`);
      const name = document.createElement("span");
      name.textContent = group.name;
      const count = document.createElement("small");
      count.textContent = String(group.workspaces.length);
      count.title = "Workspaces";
      label.append(input, name, count);
      region.append(label);
      const childInputs = [];
      for (const workspace of group.workspaces) {
        const child = document.createElement("label");
        child.className = "dc-pipeline-row dc-pipeline-row--workspace";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = workspaceSelectionKey(workspace);
        checkbox.checked = enabledWorkspaces.has(checkbox.value);
        checkbox.disabled = !input.checked;
        checkbox.setAttribute("aria-label", `Show ${workspace.name} in ${group.name}`);
        const childName = document.createElement("span");
        childName.textContent = workspace.name;
        child.append(checkbox, childName);
        region.append(child);
        childInputs.push(checkbox);
        checkbox.addEventListener("change", () => {
          if (!alive) return;
          if (checkbox.checked) enabledWorkspaces.add(checkbox.value);
          else enabledWorkspaces.delete(checkbox.value);
          updateMessage();
          notify({ autoFocus: false });
        });
      }
      input.addEventListener("change", () => {
        if (!alive) return;
        if (input.checked) enabledPipelines.add(group.id);
        else enabledPipelines.delete(group.id);
        for (const childInput of childInputs) childInput.disabled = !input.checked;
        updateMessage();
        notify({ autoFocus: false });
      });
      return region;
    });
    list.replaceChildren(...nodes);
    updateMessage();
  }

  function reload() {
    if (!alive) {
      return Promise.resolve({
        ok: false,
        error: new Error("Workspace catalogue is unavailable."),
      });
    }
    const current = ++generation;
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    message.textContent = "Loading Pipelines…";

    const operation = (async () => {
      try {
        const [pipelines, workspaces] = await Promise.all([
          catalogue.pipelines({ signal }),
          collectPages(catalogue.workspaces, { signal }),
        ]);
        if (!alive || current !== generation) return { ok: false, stale: true };
        const next = groupWorkspacePipelines(workspaces, pipelines);
        enabledPipelines = new Set(preservePipelineSelection(next, groups, enabledPipelines));
        enabledWorkspaces = new Set(preserveWorkspaceSelection(next, groups, enabledWorkspaces));
        groups = next;
        render();
        // Jobs use the complete, verified catalogue rather than map visibility.
        onWorkspacesLoaded?.(groups.flatMap((group) => group.workspaces));
        loaded = true;
        notify({ autoFocus: false });
        return { ok: true };
      } catch (error) {
        if (!alive || current !== generation) return { ok: false, stale: true };
        message.textContent = `Pipelines could not be loaded: ${error.message}`;
        return { ok: false, error };
      }
    })();
    pending = operation;
    void operation.then(() => {
      if (pending === operation) pending = null;
    });
    return operation;
  }

  function ensureLoaded() {
    if (loaded) return Promise.resolve({ ok: true });
    // The Jobs reader joins an in-flight initial read rather than sending duplicates.
    return pending ?? reload();
  }

  void reload();
  return {
    reload,
    ensureLoaded,
    destroy() {
      alive = false;
      generation++;
      request?.abort();
      container.replaceChildren();
    },
  };
}
