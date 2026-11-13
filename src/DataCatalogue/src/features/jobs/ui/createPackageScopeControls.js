import { countOpenJobsByWorkspace, packageWorkspaceKey } from "../domain/packageScopeFilter.js";

// One mounted scope control owns Pipeline and Workspace selections for both map and list.
// Native details/checkboxes preserve keyboard navigation without Calcite shadow-DOM access.
export function createPackageScopeControls({ doc = document, onChange = () => {} } = {}) {
  const element = doc.createElement("div");
  element.className = "dc-package-scope";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Package list and map scope");

  const stylesheet = doc.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./packageScopeControls.css", import.meta.url).href;
  element.append(stylesheet);

  function dropdown(label) {
    const details = doc.createElement("details");
    details.className = "dc-package-scope__dropdown";
    const summary = doc.createElement("summary");
    summary.className = "dc-package-scope__summary";
    const heading = doc.createElement("span");
    heading.className = "dc-package-scope__label";
    heading.textContent = label;
    const value = doc.createElement("span");
    value.className = "dc-package-scope__value";
    value.textContent = "Loading...";
    summary.append(heading, value);
    const options = doc.createElement("div");
    options.className = "dc-package-scope__options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", `${label} selection`);
    details.append(summary, options);
    details.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !details.open) return;
      details.open = false;
      summary.focus?.();
      event.preventDefault?.();
      event.stopPropagation?.();
    });
    element.append(details);
    return { details, summary, value, options };
  }

  const pipeline = dropdown("Pipelines");
  const workspace = dropdown("Workspaces");

  function closeDropdownsExcept(active) {
    if (active !== pipeline.details) pipeline.details.open = false;
    if (active !== workspace.details) workspace.details.open = false;
  }

  // Native details remain keyboard-accessible; opening one also closes its sibling.
  for (const [current, other] of [
    [pipeline, workspace],
    [workspace, pipeline],
  ]) {
    current.summary.addEventListener("click", () => {
      if (!current.details.open) other.details.open = false;
    });
    current.details.addEventListener("toggle", () => {
      if (alive && current.details.open) other.details.open = false;
    });
  }

  function dismissDropdownsOutside(event) {
    if (!alive) return;
    const target = event.target;
    if (pipeline.details.contains(target)) closeDropdownsExcept(pipeline.details);
    else if (workspace.details.contains(target)) closeDropdownsExcept(workspace.details);
    else closeDropdownsExcept(null);
  }
  // Listen on the owning document: the options are inside an overflow-scrolling panel.
  // Closing only the menus preserves pointer and keyboard focus on the actual target.
  doc.addEventListener?.("pointerdown", dismissDropdownsOutside, true);
  doc.addEventListener?.("focusin", dismissDropdownsOutside, true);

  const showEmptyToggleLabel = doc.createElement("label");
  showEmptyToggleLabel.className = "dc-package-scope__empty-toggle";
  showEmptyToggleLabel.title = "Show Workspaces without open Jobs";
  const showEmptyCaption = doc.createElement("span");
  showEmptyCaption.textContent = "Show empty";
  const showEmptyToggle = doc.createElement("input");
  showEmptyToggle.className = "dc-package-scope__empty-switch";
  showEmptyToggle.type = "checkbox";
  showEmptyToggle.setAttribute("role", "switch");
  showEmptyToggle.setAttribute("aria-label", "Show empty Workspaces");
  showEmptyToggleLabel.append(showEmptyCaption, showEmptyToggle);
  element.append(showEmptyToggleLabel);

  let groups = [];
  let selectedPipelineIds = [];
  let allPipelines = false;
  let hasInitialPipelineScope = false;
  let selectedWorkspaceKeys = null;
  let showEmptyWorkspaces = false;
  let hasJobCounts = false;
  let openCounts = new Map();
  let alive = true;

  const availablePipelineIds = () => groups.map((group) => group.id);
  const availableWorkspaces = () =>
    groups
      .filter((group) => selectedPipelineIds.includes(group.id))
      .flatMap((group) => group.workspaces.map((item) => ({ ...item, pipelineName: group.name })));

  function getScope() {
    return {
      pipelineIds: [...selectedPipelineIds],
      workspaceKeys: selectedWorkspaceKeys === null ? null : [...selectedWorkspaceKeys],
      showEmptyWorkspaces,
    };
  }

  function scopeChanged(previous) {
    const next = getScope();
    if (JSON.stringify(previous) !== JSON.stringify(next)) onChange(next);
  }

  function makeCheckbox(label, checked, onToggle, { count = null, disabled = false } = {}) {
    const row = doc.createElement("label");
    row.className = "dc-package-scope__option";
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    input.dataset.scopeKey = label;
    const name = doc.createElement("span");
    name.textContent = label;
    row.append(input, name);
    if (count !== null) {
      const countElement = doc.createElement("small");
      countElement.className = "dc-package-scope__count";
      countElement.textContent = `${count} open`;
      row.append(countElement);
    }
    input.addEventListener("change", () => {
      if (!alive) return;
      onToggle(input.checked);
    });
    return row;
  }

  function reconcileWorkspaceSelection() {
    if (selectedWorkspaceKeys === null) return;
    const available = new Set(availableWorkspaces().map(packageWorkspaceKey));
    selectedWorkspaceKeys = selectedWorkspaceKeys.filter((key) => available.has(key));
    if (!selectedWorkspaceKeys.length) selectedWorkspaceKeys = null;
  }

  function activeOptionKey(options) {
    for (const row of options.children) {
      const input = row.children?.[0];
      if (input === doc.activeElement) return input.dataset?.scopeKey ?? null;
    }
    return null;
  }

  function restoreFocus(options, previous, fallback) {
    if (!previous) return;
    for (const row of options.children) {
      const input = row.children?.[0];
      if (input?.dataset?.scopeKey === previous) {
        input.focus?.();
        return;
      }
    }
    // A removed Pipeline/Workspace must not leave focus on detached controls.
    fallback.focus?.();
  }

  function renderPipelines() {
    const focused = activeOptionKey(pipeline.options);
    const scrollTop = pipeline.options.scrollTop;
    const rows = [
      makeCheckbox(
        "All pipelines",
        allPipelines && groups.length > 0,
        () => {
          const previous = getScope();
          allPipelines = true;
          selectedPipelineIds = availablePipelineIds();
          reconcileWorkspaceSelection();
          render();
          scopeChanged(previous);
        },
        { disabled: groups.length === 0 }
      ),
    ];
    for (const group of groups) {
      const count = hasJobCounts
        ? group.workspaces.reduce(
            (total, item) => total + (openCounts.get(packageWorkspaceKey(item)) ?? 0),
            0
          )
        : null;
      rows.push(
        makeCheckbox(
          group.name,
          !allPipelines && selectedPipelineIds.includes(group.id),
          () => {
            const previous = getScope();
            if (allPipelines) {
              allPipelines = false;
              selectedPipelineIds = [group.id];
            } else if (selectedPipelineIds.includes(group.id)) {
              if (selectedPipelineIds.length === 1) {
                renderPipelines();
                return;
              }
              selectedPipelineIds = selectedPipelineIds.filter((id) => id !== group.id);
            } else {
              selectedPipelineIds = availablePipelineIds().filter(
                (id) => selectedPipelineIds.includes(id) || id === group.id
              );
            }
            reconcileWorkspaceSelection();
            render();
            scopeChanged(previous);
          },
          { count }
        )
      );
    }
    pipeline.options.replaceChildren(...rows);
    pipeline.options.scrollTop = scrollTop;
    restoreFocus(pipeline.options, focused, pipeline.summary);
    pipeline.value.textContent = !selectedPipelineIds.length
      ? "No Pipelines"
      : allPipelines
        ? "All pipelines"
        : selectedPipelineIds.length === 1
          ? (groups.find((group) => group.id === selectedPipelineIds[0])?.name ?? "Pipeline")
          : `${selectedPipelineIds.length} selected`;
  }

  function renderWorkspaces() {
    const focused = activeOptionKey(workspace.options);
    const scrollTop = workspace.options.scrollTop;
    const options = availableWorkspaces();
    const selected = new Set(selectedWorkspaceKeys ?? []);
    const showMultiplePipelines = selectedPipelineIds.length > 1;
    const rows = [
      makeCheckbox(
        "All Workspaces",
        selectedWorkspaceKeys === null,
        () => {
          const previous = getScope();
          selectedWorkspaceKeys = null;
          renderWorkspaces();
          scopeChanged(previous);
        },
        { disabled: options.length === 0 }
      ),
    ];
    const visible = options
      .filter((item) => {
        const key = packageWorkspaceKey(item);
        return (
          !hasJobCounts ||
          showEmptyWorkspaces ||
          (openCounts.get(key) ?? 0) > 0 ||
          selected.has(key)
        );
      })
      .sort(
        (a, b) =>
          (openCounts.get(packageWorkspaceKey(b)) ?? 0) -
            (openCounts.get(packageWorkspaceKey(a)) ?? 0) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
          a.pipelineName.localeCompare(b.pipelineName, undefined, { sensitivity: "base" })
      );
    for (const item of visible) {
      const key = packageWorkspaceKey(item);
      const label = showMultiplePipelines ? `${item.name} (${item.pipelineName})` : item.name;
      rows.push(
        makeCheckbox(
          label,
          selected.has(key),
          () => {
            const previous = getScope();
            if (selectedWorkspaceKeys === null) selectedWorkspaceKeys = [key];
            else if (selected.has(key)) {
              selectedWorkspaceKeys = selectedWorkspaceKeys.filter((value) => value !== key);
              if (!selectedWorkspaceKeys.length) selectedWorkspaceKeys = null;
            } else selectedWorkspaceKeys = [...selectedWorkspaceKeys, key];
            renderWorkspaces();
            scopeChanged(previous);
          },
          { count: hasJobCounts ? (openCounts.get(key) ?? 0) : null }
        )
      );
    }
    workspace.options.replaceChildren(...rows);
    workspace.options.scrollTop = scrollTop;
    restoreFocus(workspace.options, focused, workspace.summary);
    workspace.value.textContent =
      selectedWorkspaceKeys === null
        ? "All Workspaces"
        : selectedWorkspaceKeys.length === 1
          ? (options.find((item) => packageWorkspaceKey(item) === selectedWorkspaceKeys[0])?.name ??
            "1 selected")
          : `${selectedWorkspaceKeys.length} selected`;
    workspace.details.classList?.toggle("dc-package-scope__dropdown--empty", options.length === 0);
  }

  function render() {
    renderPipelines();
    renderWorkspaces();
  }

  showEmptyToggle.addEventListener("change", () => {
    if (!alive) return;
    const previous = getScope();
    showEmptyWorkspaces = showEmptyToggle.checked;
    // Changing this option should not resize an open options menu beneath the pointer.
    workspace.details.open = false;
    renderWorkspaces();
    scopeChanged(previous);
  });

  return {
    element,
    getScope,
    setCatalogue(nextGroups) {
      if (!alive) return;
      if (!Array.isArray(nextGroups)) throw new Error("Pipeline catalogue must be an array.");
      const previous = getScope();
      const pipelineIds = new Set();
      const next = nextGroups.map((group) => {
        if (
          typeof group?.id !== "string" ||
          !group.id.trim() ||
          pipelineIds.has(group.id) ||
          !Array.isArray(group.workspaces)
        ) {
          throw new Error("Pipeline catalogue contains an invalid or duplicate identity.");
        }
        pipelineIds.add(group.id);
        const workspaceIds = new Set();
        return {
          id: group.id,
          name: group.name || group.id,
          workspaces: group.workspaces.map((item) => {
            if (
              item.pipelineId !== group.id ||
              typeof item.workspaceId !== "string" ||
              !item.workspaceId.trim() ||
              workspaceIds.has(item.workspaceId)
            ) {
              throw new Error("Workspace catalogue contains an invalid scope.");
            }
            workspaceIds.add(item.workspaceId);
            return {
              pipelineId: group.id,
              workspaceId: item.workspaceId,
              name: item.name || item.workspaceId,
            };
          }),
        };
      });
      groups = next;
      if (!hasInitialPipelineScope && groups.length) {
        allPipelines = true;
        hasInitialPipelineScope = true;
      }
      selectedPipelineIds = allPipelines
        ? availablePipelineIds()
        : availablePipelineIds().filter((id) => selectedPipelineIds.includes(id));
      if (!selectedPipelineIds.length && groups.length) selectedPipelineIds = [groups[0].id];
      reconcileWorkspaceSelection();
      render();
      scopeChanged(previous);
    },
    setJobs(jobs) {
      if (!alive || !Array.isArray(jobs)) return;
      hasJobCounts = true;
      openCounts = countOpenJobsByWorkspace(jobs);
      render();
    },
    destroy() {
      alive = false;
      doc.removeEventListener?.("pointerdown", dismissDropdownsOutside, true);
      doc.removeEventListener?.("focusin", dismissDropdownsOutside, true);
      element.replaceChildren();
    },
  };
}
