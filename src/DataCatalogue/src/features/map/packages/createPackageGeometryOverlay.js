// One lifecycle owns Package HTTP reads, SDK preparation, focus, and publication.
// Replacing the previous Package only after the next one is ready avoids an empty-map flash.
export function createPackageGeometryOverlay({ source, renderer, onStatus = () => {} }) {
  let alive = true;
  let generation = 0;
  let request = null;
  let selectedId = null;
  let prepared = null;
  let focusPending = false;
  let currentState = { status: "empty", hasGeometry: false, hasAoi: false, detailCount: 0 };

  const isCurrent = (generationId, signal) =>
    alive && generationId === generation && !signal?.aborted;
  function publish(state) {
    currentState = state;
    if (alive) onStatus(state);
  }

  async function focus() {
    if (!alive || !selectedId) return false;
    focusPending = true;
    if (!prepared || currentState.status !== "ready") return false;
    focusPending = false;
    const current = generation;
    try {
      return (
        (await renderer.focus(prepared, { shouldApply: () => alive && current === generation })) !==
        false
      );
    } catch (error) {
      if (alive && current === generation && error?.name !== "AbortError") {
        publish({
          ...currentState,
          navigationError: "Package geometry could not be focused. Try again.",
        });
      }
      return false;
    }
  }

  async function setPackage(packageId, { reload = false, autoFocus = false } = {}) {
    if (!alive) return currentState;
    const id = packageId || null;
    if (!reload && selectedId === id) {
      if (autoFocus) await focus();
      return currentState;
    }
    selectedId = id;
    const current = ++generation;
    request?.abort();
    renderer.stop();
    prepared = null;
    focusPending = autoFocus;
    if (!id) {
      renderer.clear();
      publish({ status: "empty", hasGeometry: false, hasAoi: false, detailCount: 0 });
      return currentState;
    }
    request = new AbortController();
    const { signal } = request;
    publish({ status: "loading", hasGeometry: false, hasAoi: false, detailCount: 0 });
    try {
      const geometry = await source.load(id, { signal });
      if (!isCurrent(current, signal)) return currentState;
      const next = await renderer.prepare(geometry, {
        shouldApply: () => isCurrent(current, signal),
      });
      if (!isCurrent(current, signal)) return currentState;
      renderer.replace(next);
      prepared = next;
      const hasGeometry = Boolean(next.graphics.length);
      publish({
        status: hasGeometry ? "ready" : "empty",
        hasGeometry,
        hasAoi: Boolean(geometry.aoi),
        detailCount: next.detailCount,
      });
      if (focusPending && hasGeometry) await focus();
      return currentState;
    } catch (error) {
      if (!isCurrent(current, signal)) return currentState;
      renderer.clear();
      prepared = null;
      focusPending = false;
      publish({
        status: "error",
        hasGeometry: false,
        hasAoi: false,
        detailCount: 0,
        message: error?.message || "Package geometry could not be displayed.",
      });
      return currentState;
    }
  }

  return {
    setPackage,
    focus,
    getState: () => ({ ...currentState }),
    destroy() {
      alive = false;
      generation++;
      request?.abort();
      prepared = null;
      renderer.stop();
      renderer.destroy();
    },
  };
}

export function packageGeometryMessage(state) {
  if (state.status === "loading") return "Loading selected Package geometry…";
  if (state.status === "error") return `Package geometry unavailable: ${state.message}`;
  if (state.status === "empty") return "No Package geometry is available for this selection.";
  return [
    "Selected Package AOI displayed as a dashed outline.",
    state.detailCount
      ? `${state.detailCount} detailed Feature geometry ${state.detailCount === 1 ? "item" : "items"} displayed.`
      : "No detailed Feature geometry is available.",
    state.navigationError,
  ]
    .filter(Boolean)
    .join(" ");
}
