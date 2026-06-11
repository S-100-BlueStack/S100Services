import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
const DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT = "pm-display-scale-override-change";
const DISPLAY_SCALE_OVERRIDE_STORAGE_KEY = "pm.displayScale.hidingDisabled";

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

  setDisplayScaleHidingDisabled(false, {
    source: "preferences",
  });
}

function removePersistedDisplayScaleHidingDisabled() {
  try {
    window.localStorage.removeItem(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to remove display scale hiding preference.", error);
  }
}

function readPersistedDisplayScaleHidingDisabled() {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE)) {
    return false;
  }

  try {
    return window.localStorage.getItem(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read display scale hiding preference.", error);
    return false;
  }
}

function writePersistedDisplayScaleHidingDisabled(disabled) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE)) {
    return;
  }

  try {
    window.localStorage.setItem(DISPLAY_SCALE_OVERRIDE_STORAGE_KEY, String(Boolean(disabled)));
  } catch (error) {
    console.warn("Failed to save display scale hiding preference.", error);
  }
}
