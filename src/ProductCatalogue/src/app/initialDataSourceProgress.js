const DEFAULT_START_PROGRESS = 0.52;
const DEFAULT_END_PROGRESS = 0.96;

export function createInitialDataSourceProgress({
  controller,
  onProgress,
  startProgress = DEFAULT_START_PROGRESS,
  endProgress = DEFAULT_END_PROGRESS,
} = {}) {
  let latestStates = readStates(controller);
  let trackedSourceIds = collectStartedSourceIds(latestStates);
  let active = false;

  const unsubscribe =
    typeof controller?.subscribe === "function"
      ? controller.subscribe((states) => {
          latestStates = Array.isArray(states) ? states : [];
          if (!active) {
            trackedSourceIds = collectStartedSourceIds(latestStates);
            return;
          }
          publish();
        })
      : () => {};

  return {
    begin,
    destroy,
  };

  function begin() {
    active = true;
    latestStates = readStates(controller, latestStates);
    const startedAtBoundary = collectStartedSourceIds(latestStates);
    if (startedAtBoundary.size > 0) {
      trackedSourceIds = startedAtBoundary;
    }
    publish();
  }

  function publish() {
    if (typeof onProgress !== "function") {
      return;
    }

    const stateBySourceId = new Map(
      latestStates.map(({ source, state }) => [source?.id ?? state?.sourceId, state])
    );
    const total = trackedSourceIds.size;
    const completed = [...trackedSourceIds].filter((sourceId) => {
      const state = stateBySourceId.get(sourceId);
      return Boolean(
        state && !state.loading && (state.enabled || state.error || !state.requestedEnabled)
      );
    }).length;
    const ratio = total === 0 ? 1 : completed / total;
    const progress = startProgress + ratio * (endProgress - startProgress);

    onProgress({
      progress,
      completed,
      total,
      text: createProgressText(completed, total),
    });
  }

  function destroy() {
    unsubscribe?.();
  }
}

function collectStartedSourceIds(states) {
  return new Set(
    (Array.isArray(states) ? states : [])
      .filter(
        ({ state }) => state?.requestedEnabled || state?.loading || state?.enabled || state?.error
      )
      .map(({ source, state }) => source?.id ?? state?.sourceId)
      .filter(Boolean)
  );
}

function readStates(controller, fallback = []) {
  return typeof controller?.getStates === "function" ? controller.getStates() : fallback;
}

function createProgressText(completed, total) {
  if (total === 0) {
    return "Finalizing map...";
  }
  if (completed >= total) {
    return `Data sources loaded (${completed}/${total})...`;
  }
  return `Loading data sources (${completed}/${total})...`;
}
