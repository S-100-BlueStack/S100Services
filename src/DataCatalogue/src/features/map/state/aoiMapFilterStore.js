import { createDefaultAoiMapFilters, normalizeAoiMapFilters } from "../domain/aoiMapFilters.js";

export function createAoiMapFilterStore(initialFilters = createDefaultAoiMapFilters()) {
  let state = {
    filters: normalizeAoiMapFilters(initialFilters),
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
      filters: {
        ...state.filters,
      },
    };
  }

  function setFilters(nextFilters) {
    state = {
      filters: normalizeAoiMapFilters({
        ...state.filters,
        ...nextFilters,
      }),
    };

    emit();

    return getSnapshot();
  }

  function clearFilters() {
    state = {
      filters: createDefaultAoiMapFilters(),
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
