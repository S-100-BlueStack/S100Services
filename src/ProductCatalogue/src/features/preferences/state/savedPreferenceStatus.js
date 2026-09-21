const SAVED_PREFERENCE_CHANGE_EVENT = "pc-saved-preference-change";

// Read storage independently of runtime defaults and persistence enablement.
export function readSavedPreferenceStatus(storageKey, describe = () => "Saved") {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === null ? "Not saved" : describe(value);
  } catch {
    return "Saved state unavailable";
  }
}

export function notifySavedPreferenceChanged() {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
  document.dispatchEvent(new CustomEvent(SAVED_PREFERENCE_CHANGE_EVENT));
}

export function onSavedPreferenceChanged(callback) {
  document.addEventListener(SAVED_PREFERENCE_CHANGE_EVENT, callback);
  return {
    remove() {
      document.removeEventListener(SAVED_PREFERENCE_CHANGE_EVENT, callback);
    },
  };
}
