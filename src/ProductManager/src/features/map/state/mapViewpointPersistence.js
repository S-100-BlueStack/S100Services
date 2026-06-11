import { watch } from "@arcgis/core/core/reactiveUtils.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
const MAP_VIEWPOINT_STORAGE_KEY = "pm:main-map-viewpoint:v1";
const SAVE_DEBOUNCE_MS = 300;

export const DEFAULT_MAIN_MAP_VIEWPOINT = Object.freeze({
  center: [10.3, 56],
  zoom: 6,
  rotation: 0,
});

export function bindMapViewpointPersistence(view) {
  if (!view) {
    return {
      remove() {},
    };
  }

  let saveTimeoutId = null;
  let canSave = false;

  const restorePromise = restoreMapViewpoint(view).finally(() => {
    canSave = true;
  });

  const stationaryHandle = watch(
    () => view.stationary,
    (stationary) => {
      if (!stationary || !canSave) {
        return;
      }

      scheduleSave();
    }
  );

  const persistenceHandle = onPreferencePersistenceChanged(({ key, enabled }) => {
    if (key !== PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT) {
      return;
    }

    if (!enabled) {
      window.clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
      clearStoredMapViewpoint();
      return;
    }

    scheduleSave();
  });

  function scheduleSave() {
    window.clearTimeout(saveTimeoutId);

    saveTimeoutId = window.setTimeout(() => {
      saveTimeoutId = null;
      saveMapViewpoint(view);
    }, SAVE_DEBOUNCE_MS);
  }

  return {
    async ready() {
      await restorePromise;
    },

    remove() {
      window.clearTimeout(saveTimeoutId);
      stationaryHandle?.remove?.();
      persistenceHandle?.remove?.();
    },
  };
}

export async function resetMapViewpoint(view) {
  clearStoredMapViewpoint();

  if (!view) {
    return false;
  }

  try {
    await view.when();

    await view.goTo(
      {
        center: DEFAULT_MAIN_MAP_VIEWPOINT.center,
        zoom: DEFAULT_MAIN_MAP_VIEWPOINT.zoom,
        rotation: DEFAULT_MAIN_MAP_VIEWPOINT.rotation,
      },
      {
        animate: true,
      }
    );

    saveMapViewpoint(view);
    return true;
  } catch (error) {
    console.warn("[Map viewpoint] Failed to reset viewpoint", error);
    return false;
  }
}

export function clearStoredMapViewpoint() {
  try {
    window.localStorage.removeItem(MAP_VIEWPOINT_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("[Map viewpoint] Failed to clear saved viewpoint", error);
    return false;
  }
}

async function restoreMapViewpoint(view) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT)) {
    return false;
  }

  const storedViewpoint = readStoredMapViewpoint();

  if (!storedViewpoint) {
    return false;
  }

  try {
    await view.when();

    await view.goTo(
      {
        center: [storedViewpoint.center.longitude, storedViewpoint.center.latitude],
        scale: storedViewpoint.scale,
        rotation: storedViewpoint.rotation,
      },
      {
        animate: false,
      }
    );

    return true;
  } catch (error) {
    console.warn("[Map viewpoint] Failed to restore saved viewpoint", error);
    return false;
  }
}

function saveMapViewpoint(view) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT)) {
    return false;
  }
  const viewpoint = createStoredMapViewpoint(view);

  if (!viewpoint) {
    return false;
  }

  try {
    window.localStorage.setItem(MAP_VIEWPOINT_STORAGE_KEY, JSON.stringify(viewpoint));
    return true;
  } catch (error) {
    console.warn("[Map viewpoint] Failed to save viewpoint", error);
    return false;
  }
}

function readStoredMapViewpoint() {
  try {
    const rawValue = window.localStorage.getItem(MAP_VIEWPOINT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    return validateStoredMapViewpoint(JSON.parse(rawValue));
  } catch (error) {
    console.warn("[Map viewpoint] Failed to read saved viewpoint", error);
    return null;
  }
}

function createStoredMapViewpoint(view) {
  const longitude = Number(view.center?.longitude);
  const latitude = Number(view.center?.latitude);
  const scale = Number(view.scale);
  const rotation = Number(view.rotation ?? 0);

  const viewpoint = {
    center: {
      longitude,
      latitude,
    },
    scale,
    rotation,
    savedAt: new Date().toISOString(),
  };

  return validateStoredMapViewpoint(viewpoint);
}

function validateStoredMapViewpoint(value) {
  const longitude = Number(value?.center?.longitude);
  const latitude = Number(value?.center?.latitude);
  const scale = Number(value?.scale);
  const rotation = Number(value?.rotation ?? 0);

  if (!isValidLongitude(longitude)) {
    return null;
  }

  if (!isValidLatitude(latitude)) {
    return null;
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  if (!Number.isFinite(rotation)) {
    return null;
  }

  return {
    center: {
      longitude,
      latitude,
    },
    scale,
    rotation,
    savedAt: typeof value?.savedAt === "string" ? value.savedAt : null,
  };
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}
