import {
  readSavedPreferenceStatus,
  notifySavedPreferenceChanged,
} from "../../preferences/state/savedPreferenceStatus.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
import {
  DEFAULT_DISPLAY_SCALE_HIDING_DISABLED,
  parsePersistedDisplayScaleHidingDisabled,
  serializeDisplayScaleHidingDisabled,
} from "./displayScalePreference.js";
const DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT = "pc-display-scale-override-change";
const DISPLAY_SCALE_OVERRIDE_STORAGE_KEY = "pc.displayScale.hidingDisabled";

let displayScaleHidingDisabled = readPersistedDisplayScaleHidingDisabled();

onPreferencePersistenceChanged(({ key, enabled }) => {
  if (key !== PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE) {
    return;
  }

  if (!enabled) {
    removePersistedDisplayScaleHidingDisabled();
    return;
  }

  writePersistedDisplayScaleHidingDisabled(displayScaleHidingDisabled);
});

export function isDisplayScaleHidingDisabled() {
  return displayScaleHidingDisabled;
}

export function setDisplayScaleHidingDisabled(disabled, { source = "manual" } = {}) {
  const nextDisabled = Boolean(disabled);

  if (source === "manual") {
    writePersistedDisplayScaleHidingDisabled(nextDisabled);
  }

  if (displayScaleHidingDisabled === nextDisabled) {
    return;
  }

  displayScaleHidingDisabled = nextDisabled;
  notifySavedPreferenceChanged();

  document.dispatchEvent(
    new CustomEvent(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, {
      detail: {
        disabled: displayScaleHidingDisabled,
        source,
      },
    })
  );
}

export function toggleDisplayScaleHidingDisabled() {
  setDisplayScaleHidingDisabled(!displayScaleHidingDisabled, {
    source: "manual",
  });
}

export function onDisplayScaleOverrideChange(callback) {
  const handler = (event) => {
    callback(event.detail);
  };

  document.addEventListener(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, handler);

  return {
    remove() {
      document.removeEventListener(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, handler);
    },
  };
}

export function resetDisplayScaleHidingPreference() {
  removePersistedDisplayScaleHidingDisabled();

  setDisplayScaleHidingDisabled(DEFAULT_DISPLAY_SCALE_HIDING_DISABLED, {
    source: "preferences",
  });
}

export function removePersistedDisplayScaleHidingDisabled() {
  try {
    window.localStorage.removeItem(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY);
    notifySavedPreferenceChanged();
  } catch (error) {
    console.warn("Failed to remove display scale hiding preference.", error);
  }
}

function readPersistedDisplayScaleHidingDisabled() {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE)) {
    return DEFAULT_DISPLAY_SCALE_HIDING_DISABLED;
  }

  try {
    return parsePersistedDisplayScaleHidingDisabled(
      window.localStorage.getItem(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY)
    );
  } catch (error) {
    console.warn("Failed to read display scale hiding preference.", error);
    return DEFAULT_DISPLAY_SCALE_HIDING_DISABLED;
  }
}

function writePersistedDisplayScaleHidingDisabled(disabled) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE)) {
    return;
  }

  try {
    window.localStorage.setItem(
      DISPLAY_SCALE_OVERRIDE_STORAGE_KEY,
      serializeDisplayScaleHidingDisabled(disabled)
    );
    notifySavedPreferenceChanged();
  } catch (error) {
    console.warn("Failed to save display scale hiding preference.", error);
  }
}

export function getSavedDisplayScaleStatus() {
  return readSavedPreferenceStatus(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY, (value) =>
    value === "false"
      ? "Saved: ON"
      : value === "true"
        ? "Saved: OFF"
        : "Saved value invalid (default: OFF)"
  );
}
