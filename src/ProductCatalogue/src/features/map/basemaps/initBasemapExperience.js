import { getCurrentTheme, onThemeChanged } from "../../themes/themeService.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../../preferences/state/preferencePersistenceState.js";
import { readArcGISBasemapApiKey } from "../../../shared/config/arcgisBasemapConfig.js";
import { createBasemapSettings } from "./basemapSettings.js";
import { createBasemapSelector } from "./createBasemapSelector.js";
import { initZoomControl } from "../controls/initZoomControl.js";

export function initBasemapExperience(view) {
  if (!view?.map || !view?.ui?.add || !view?.ui?.remove) {
    return { settings: null, close: () => false, destroy() {} };
  }

  const settings = createBasemapSettings({
    apiKey: readArcGISBasemapApiKey(),
    themeMode: getCurrentTheme(),
    canPersist: () => isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.BASEMAP),
    onPersistenceChanged: (callback) =>
      onPreferencePersistenceChanged(({ key, enabled }) => {
        if (key === PREFERENCE_PERSISTENCE_KEY.BASEMAP) callback(enabled);
      }),
  });
  const unregisterMap = settings.registerMap(view.map);
  const host = document.createElement("div");
  host.className = "pc-basemap-controls";
  const selector = createBasemapSelector({ container: host, settings });
  // Keep the selector immediately below Zoom on both map routes. The Zoom
  // owner places the built-in fallback and replacement at index zero.
  view.ui.add([{ component: host, position: "top-right", index: 1 }]);
  selector.setView(view);
  const zoomControl = initZoomControl(view, { themeMode: settings.getThemeMode() });
  const themeHandle = onThemeChanged((theme) => {
    settings.setThemeMode(theme);
    selector.setThemeMode(theme);
    zoomControl.setThemeMode(theme);
  });

  let alive = true;
  return {
    settings,
    close: () => selector.close(),
    destroy() {
      if (!alive) return;
      alive = false;
      selector.destroy();
      zoomControl.destroy();
      view.ui.remove(host);
      themeHandle.remove();
      unregisterMap();
      settings.destroy();
    },
  };
}
