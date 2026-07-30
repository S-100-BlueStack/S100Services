const PREFERENCE_PERSISTENCE_STORAGE_KEY = "pc.preferences.persistence.v1";
const PREFERENCE_PERSISTENCE_CHANGE_EVENT = "pc-preference-persistence-change";

export const PREFERENCE_PERSISTENCE_KEY = Object.freeze({
  MAP_VIEWPOINT: "mapViewpoint",
  ATTRIBUTE_FILTERS: "attributeFilters",
  DISPLAY_SCALE_OVERRIDE: "displayScaleOverride",
  THEME: "theme",
});

const DEFAULT_PERSISTENCE_STATE = Object.freeze({
  [PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT]: true,
  [PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS]: true,
  [PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE]: true,
  [PREFERENCE_PERSISTENCE_KEY.THEME]: true,
});

let persistenceState = readPersistenceState();

export function getPreferencePersistenceState() {
  return {
    ...persistenceState,
  };
}

export function isPreferencePersistenceEnabled(key) {
  return persistenceState[key] !== false;
}

export function setPreferencePersistenceEnabled(key, enabled) {
  if (!hasPersistenceKey(key)) {
    return false;
  }

  const nextEnabled = Boolean(enabled);

  if (persistenceState[key] === nextEnabled) {
    return false;
  }

  persistenceState = {
    ...persistenceState,
    [key]: nextEnabled,
  };

  writePersistenceState(persistenceState);

  document.dispatchEvent(
    new CustomEvent(PREFERENCE_PERSISTENCE_CHANGE_EVENT, {
      detail: {
        key,
        enabled: nextEnabled,
        state: getPreferencePersistenceState(),
      },
    })
  );

  return true;
}

export function onPreferencePersistenceChanged(callback) {
  const handler = (event) => {
    callback(event.detail);
  };

  document.addEventListener(PREFERENCE_PERSISTENCE_CHANGE_EVENT, handler);

  return {
    remove() {
      document.removeEventListener(PREFERENCE_PERSISTENCE_CHANGE_EVENT, handler);
    },
  };
}

function readPersistenceState() {
  try {
    const rawValue = window.localStorage.getItem(PREFERENCE_PERSISTENCE_STORAGE_KEY);

    if (!rawValue) {
      return {
        ...DEFAULT_PERSISTENCE_STATE,
      };
    }

    return normalizePersistenceState(JSON.parse(rawValue));
  } catch (error) {
    console.warn("Failed to read preference persistence settings.", error);

    return {
      ...DEFAULT_PERSISTENCE_STATE,
    };
  }
}

function writePersistenceState(state) {
  try {
    window.localStorage.setItem(
      PREFERENCE_PERSISTENCE_STORAGE_KEY,
      JSON.stringify(normalizePersistenceState(state))
    );
  } catch (error) {
    console.warn("Failed to save preference persistence settings.", error);
  }
}

function normalizePersistenceState(value) {
  const state = {
    ...DEFAULT_PERSISTENCE_STATE,
  };

  for (const key of Object.keys(DEFAULT_PERSISTENCE_STATE)) {
    if (typeof value?.[key] === "boolean") {
      state[key] = value[key];
    }
  }

  return state;
}

function hasPersistenceKey(key) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PERSISTENCE_STATE, key);
}
