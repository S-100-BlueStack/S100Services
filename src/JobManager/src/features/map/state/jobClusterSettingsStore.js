import {
  createDefaultJobClusterSettings,
  normalizeJobClusterSettings,
} from "../domain/jobClusterSettings.js";

export function createJobClusterSettingsStore(initialSettings = createDefaultJobClusterSettings()) {
  let state = {
    settings: normalizeJobClusterSettings(initialSettings),
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
      settings: {
        ...state.settings,
      },
    };
  }

  function setSettings(nextSettings) {
    state = {
      settings: normalizeJobClusterSettings({
        ...state.settings,
        ...nextSettings,
      }),
    };

    emit();

    return getSnapshot();
  }

  function resetSettings() {
    state = {
      settings: createDefaultJobClusterSettings(),
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
    setSettings,
    resetSettings,
  };
}
