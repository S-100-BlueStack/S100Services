import { workspaceGeometryContextKey } from "../../../shared/api/workspaceGeometry.js";

// This lifecycle owns both HTTP and SDK continuations. Renderers must prepare without publishing.
export function createWorkspaceOverlay({ source, renderer, onStatus = () => {} }) {
  let alive = true;
  let generation = 0;
  let request = null;
  let currentKey = null;
  let entries = [];
  let focusPending = false;
  let currentState = { status: "empty", count: 0, total: 0, failures: [] };
  const publish = (state) => {
    currentState = state;
    if (alive) onStatus(state);
  };

  async function focus() {
    if (!alive) return;
    focusPending = true;
    if (!entries.length) return;
    focusPending = false;
    const current = generation;
    try {
      await renderer.focus(entries, { shouldApply: () => alive && current === generation });
    } catch (error) {
      if (alive && current === generation && error.name !== "AbortError")
        publish({
          ...currentState,
          navigationError: "Workspace coverage could not be focused. Try Focus again.",
        });
    }
  }

  async function setContext(
    { id = null, workspaces = [] } = {},
    { reload = false, autoFocus = true } = {}
  ) {
    if (!alive) return;
    let key;
    try {
      key = JSON.stringify([id, workspaces.map(workspaceGeometryContextKey).sort()]);
    } catch (error) {
      currentKey = null;
      generation++;
      request?.abort();
      renderer.stop();
      renderer.clear();
      entries = [];
      publish({
        status: "error",
        count: 0,
        total: workspaces.length,
        failures: [{ message: error.message }],
      });
      return;
    }
    if (!reload && currentKey === key) return;
    const changed = currentKey !== key;
    currentKey = key;
    const current = ++generation;
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    const isCurrent = () => alive && current === generation && !signal.aborted;
    renderer.stop();
    renderer.clear();
    entries = [];
    focusPending = autoFocus && changed;
    if (!workspaces.length) {
      publish({ status: "empty", count: 0, total: 0, failures: [] });
      return;
    }
    publish({ status: "loading", count: 0, total: workspaces.length, failures: [] });
    try {
      const results = await source.load(workspaces, { signal });
      if (!isCurrent()) return;
      const prepared = [];
      const failures = [];
      for (const result of results) {
        try {
          if (result.error) throw result.error;
          const geometry = await renderer.prepare(result.polygon);
          if (!isCurrent()) return;
          prepared.push({ workspace: result.workspace, geometry });
        } catch (error) {
          if (!isCurrent()) return;
          failures.push({ workspace: result.workspace, message: error.message });
        }
      }
      if (!isCurrent()) return;
      renderer.replace(prepared);
      entries = prepared;
      publish({
        status: failures.length ? (entries.length ? "partial" : "error") : "ready",
        count: entries.length,
        total: results.length,
        failures,
      });
      if (focusPending) await focus();
    } catch (error) {
      if (isCurrent())
        publish({
          status: "error",
          count: 0,
          total: workspaces.length,
          failures: [{ message: error.message }],
        });
    }
  }

  return {
    setContext,
    focus,
    setVisibleWorkspaces(workspaces) {
      if (alive) renderer.setVisibleWorkspaces?.(workspaces);
    },
    setOpenJobCounts(counts) {
      if (alive) renderer.setOpenJobCounts?.(counts);
    },
    destroy() {
      alive = false;
      generation++;
      request?.abort();
      entries = [];
      renderer.stop();
      renderer.destroy();
    },
  };
}

export function workspaceOverlayMessage(state) {
  const failures = state.failures
    .slice(0, 3)
    .map(
      ({ workspace, message }) =>
        `${workspace ? `${workspace.pipelineId} / ${workspace.name || workspace.workspaceId}: ` : ""}${message}`
    );
  return [
    state.status === "loading"
      ? `Loading ${state.total} Workspace polygon${state.total === 1 ? "" : "s"}…`
      : state.total
        ? `${state.count} of ${state.total} Workspace polygons displayed. Workspace outlines show coverage; colors indicate open Jobs on the main map.`
        : "",
    ...failures,
    state.failures.length > 3
      ? `${state.failures.length - 3} additional Workspace geometry failures.`
      : "",
    state.navigationError,
  ]
    .filter(Boolean)
    .join(" ");
}
