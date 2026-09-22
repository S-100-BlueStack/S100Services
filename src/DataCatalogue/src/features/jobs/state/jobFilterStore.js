import { createDefaultJobFilters, normalizeJobFilters } from "../domain/jobFilters.js";

export function createJobFilterStore(initialFilters = createDefaultJobFilters()) {
  let state = {
    filters: normalizeJobFilters(initialFilters),
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      filters: cloneFilters(state.filters),
    };
  }

  function setFilters(nextFilters) {
    state = {
      filters: normalizeJobFilters({
        ...state.filters,
        ...nextFilters,
      }),
    };

    emit();

    return getSnapshot();
  }

  function clearFilters() {
    state = {
      filters: createDefaultJobFilters(),
    };

    emit();

    return getSnapshot();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    setFilters,
    clearFilters,
  };
}

function cloneFilters(filters) {
  return {
    ...filters,
    statusValues: [...filters.statusValues],
    priorityValues: [...filters.priorityValues],
  };
}
