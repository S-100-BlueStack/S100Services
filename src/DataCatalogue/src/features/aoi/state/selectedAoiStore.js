export function createSelectedAoiStore() {
  let state = {
    selectedAoi: null,
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
      selectedAoi: state.selectedAoi ? { ...state.selectedAoi } : null,
    };
  }

  function selectAoi(aoi) {
    const selectedAoi = normalizeSelectedAoi(aoi);

    setState({
      selectedAoi,
    });

    return selectedAoi;
  }

  function clearSelection() {
    setState({
      selectedAoi: null,
    });
  }

  function setState(partialState) {
    state = {
      ...state,
      ...partialState,
    };

    emit();
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
    selectAoi,
    clearSelection,
  };
}

function normalizeSelectedAoi(aoi = {}) {
  return {
    aoiId: normalizeOptionalString(aoi.aoiId ?? aoi.id),
    aoiName: normalizeOptionalString(aoi.aoiName ?? aoi.name) || "Selected AOI",
    objectId: normalizeOptionalString(aoi.objectId),
  };
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
