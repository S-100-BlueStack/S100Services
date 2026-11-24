import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
import { notifySavedPreferenceChanged } from "../../preferences/state/savedPreferenceStatus.js";

export const REVIEW_SYNC_SCROLLING_STORAGE_KEY = "pc.review.syncScrolling.v1";
const persistenceKey = PREFERENCE_PERSISTENCE_KEY.REVIEW_SYNC_SCROLLING;

// One Review session owns the runtime value. Auto-save controls only its stored copy.
export function createReviewScrollSettings() {
  let enabled = readSavedValue();
  let disposed = false;
  const listeners = new Set();
  const persistenceHandle = onPreferencePersistenceChanged(({ key, enabled: autoSave }) => {
    if (disposed || key !== persistenceKey) return;
    updateStorage(autoSave ? enabled : null);
  });

  function publish(next) {
    if (enabled === next) return false;
    enabled = next;
    for (const listener of listeners) listener(enabled);
    return true;
  }

  return {
    getValue: () => enabled,
    setValue(next) {
      if (disposed || typeof next !== "boolean" || !publish(next)) return false;
      if (isPreferencePersistenceEnabled(persistenceKey)) updateStorage(enabled);
      return true;
    },
    reset() {
      if (disposed) return;
      publish(false);
      // Reset removes the saved setting without changing its Auto-save policy.
      updateStorage(null);
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      persistenceHandle.remove();
      listeners.clear();
    },
  };
}

function readSavedValue() {
  if (!isPreferencePersistenceEnabled(persistenceKey)) return false;
  try {
    return window.localStorage.getItem(REVIEW_SYNC_SCROLLING_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("[Review] Failed to read saved scroll synchronization setting.", error);
    return false;
  }
}

function updateStorage(value) {
  try {
    if (value === null) window.localStorage.removeItem(REVIEW_SYNC_SCROLLING_STORAGE_KEY);
    else window.localStorage.setItem(REVIEW_SYNC_SCROLLING_STORAGE_KEY, String(value));
    notifySavedPreferenceChanged();
  } catch (error) {
    console.warn("[Review] Failed to update saved scroll synchronization setting.", error);
  }
}
