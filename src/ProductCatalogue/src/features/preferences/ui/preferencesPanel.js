import { noticeSuccess } from "../../notices/services/noticeService.js";
import { resetDashboardPageSizePreference } from "../../dashboard/state/dashboardPageSizePreference.js";
import {
  getCurrentTheme,
  resetThemePreference,
  themes,
  toggleTheme,
} from "../../themes/themeService.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  getPreferencePersistenceState,
  setPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../state/preferencePersistenceState.js";

const PREFERENCE_ITEMS = [
  {
    key: PREFERENCE_PERSISTENCE_KEY.BASEMAP,
    title: "Basemap",
    requiresBasemapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT,
    title: "Map view",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.THEME,
    title: "Theme",
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS,
    title: "Filters",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE,
    title: "Scale hiding",
    persistenceLabel: "Save Scale hiding setting in this browser",
    noticeTitle: "Scale hiding",
    requiresMapContext: true,
  },
];
const POPOVER_ID = "preferences";
let activePanel = null;

export function initPreferencesPanel({
  view,
  mapPreferences,
  dataSourceController,
  onStartIntroduction,
  themeView,
  basemapSettings,
  navbarPopoverCoordinator,
} = {}) {
  if (activePanel) {
    activePanel.updateContext({
      view,
      mapPreferences,
      dataSourceController,
      onStartIntroduction,
      themeView,
      basemapSettings,
      navbarPopoverCoordinator,
    });
    return activePanel.api;
  }

  const button = ensurePreferencesButton();

  if (!button) {
    return createEmptyApi();
  }
  const panel = document.createElement("section");
  panel.id = "preferences-panel";
  panel.className = "pc-preferences-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Preferences");
  document.body.append(panel);

  const context = {
    view: null,
    mapPreferences: null,
    dataSourceController: null,
    onStartIntroduction: null,
    themeView: null,
    basemapSettings: null,
  };

  const isOpen = () => !panel.hidden;
  let displayScaleControlHandle = null;
  let unsubscribeBasemapSettings = null;
  let currentNavbarCoordinator = null;
  let unregisterPopover = null;
  const render = () => {
    const focusedIdentity = panel.contains(document.activeElement)
      ? document.activeElement.dataset.preferenceFocus
      : null;
    displayScaleControlHandle?.remove();
    displayScaleControlHandle = null;

    const persistenceState = getPreferencePersistenceState();
    const availableItems = PREFERENCE_ITEMS.filter(
      (item) =>
        (!item.requiresMapContext || context.mapPreferences) &&
        (!item.requiresBasemapContext || context.basemapSettings)
    );

    panel.innerHTML = `
      <div class="pc-preferences-panel__header">
        <h2>Preferences</h2>
        <button
          type="button"
          class="pc-preferences-panel__close"
          data-preference-action="close-panel"
          aria-label="Close Preferences"
          title="Close Preferences"
        ><calcite-icon icon="x" scale="s" aria-hidden="true"></calcite-icon></button>
      </div>
      <div class="pc-preferences-panel__content">
        <section class="pc-preferences-panel__display" aria-labelledby="preferences-display-heading">
          <h3 id="preferences-display-heading">Display</h3>
          ${renderThemeSetting(getCurrentTheme())}
          ${context.basemapSettings ? renderBasemapSetting(context.basemapSettings) : ""}
          ${context.mapPreferences ? renderDisplayScaleSetting(context.mapPreferences) : ""}
        </section>
        <section class="pc-preferences-panel__group" aria-labelledby="preferences-saved-heading">
          <h3 id="preferences-saved-heading">Saved preferences</h3>
          <p>Auto-save remembers settings in this browser. Turning it off clears the saved value.</p>
          ${availableItems.map((item) => renderPreferenceItem(item, persistenceState)).join("")}
          <div class="pc-preferences-panel__restore-row">
            <button
              type="button"
              class="pc-preferences-panel__introduction-action"
              data-preference-action="start-introduction"
              aria-label="Start introduction"
              title="Show a short guide to the controls on this page."
            >
              <calcite-icon icon="information" scale="s" aria-hidden="true"></calcite-icon>
              <span>Start introduction</span>
            </button>
            <button
              type="button"
              class="pc-preferences-panel__restore"
              data-preference-action="reset-all"
              title="${
                context.mapPreferences
                  ? "Restore map view, filters, Scale hiding, source selection, Basemap and Theme."
                  : context.basemapSettings
                    ? "Restore Basemap and Theme to their defaults."
                    : document.body.classList.contains("pc-dashboard-route")
                      ? "Restore Theme and Dashboard page size to 50."
                      : "Restore Theme to Light."
              } Auto-save choices are unchanged."
            >Restore defaults</button>
          </div>
        </section>
      </div>
    `;

    if (context.mapPreferences) {
      displayScaleControlHandle = context.mapPreferences.bindDisplayScaleOverrideControl(
        panel.querySelector("#preferences-scale-hiding")
      );
    }
    for (const element of panel.querySelectorAll("button, input, calcite-switch")) {
      element.dataset.preferenceFocus =
        (element.dataset.preferenceAction ??
          element.dataset.preferencePersistenceKey ??
          element.id) ||
        element.value;
      if (focusedIdentity && element.dataset.preferenceFocus === focusedIdentity) {
        if (element.setFocus) void element.setFocus();
        else element.focus();
      }
    }
  };

  const sync = () => {
    if (!isOpen()) return;
    const persistence = getPreferencePersistenceState();
    for (const element of panel.querySelectorAll("[data-preference-persistence-key]")) {
      element.checked = persistence[element.dataset.preferencePersistenceKey] !== false;
    }
    const darkMode = panel.querySelector("#preferences-dark-mode");
    if (darkMode) darkMode.checked = getCurrentTheme() === themes.dark;
    const basemapStatus = panel.querySelector("#preferences-basemap-status");
    if (basemapStatus && context.basemapSettings) {
      basemapStatus.textContent = getBasemapDescription(context.basemapSettings);
    }
    const scale = panel.querySelector("#preferences-scale-hiding");
    if (scale && context.mapPreferences) {
      scale.checked = !context.mapPreferences.isDisplayScaleHidingDisabled();
    }
  };
  // Owner subscribers may run later in the same persistence event dispatch.
  const persistenceHandle = onPreferencePersistenceChanged(() => queueMicrotask(sync));

  const setOpen = (open, { restoreFocus = false, focusInitial = true } = {}) => {
    const wasOpen = isOpen();
    panel.hidden = !open;
    button.toggleAttribute("active", open);
    button.setAttribute("aria-expanded", String(open));

    if (open) {
      render();
      sync();
      positionPanel(button, panel);
      const initialFocus =
        panel.querySelector("#preferences-dark-mode") ??
        panel.querySelector("[data-preference-action]");
      if (focusInitial) {
        if (initialFocus?.setFocus) void initialFocus.setFocus();
        else initialFocus?.focus();
      }
    } else if (wasOpen && restoreFocus) {
      button.setFocus?.();
      if (!button.setFocus) button.focus();
    }
  };

  const handleAction = async (action) => {
    switch (action) {
      case "close-panel":
        close({ restoreFocus: true });
        break;
      case "start-introduction":
        close({ restoreFocus: false });
        context.onStartIntroduction?.();
        break;
      case "reset-basemap":
        context.basemapSettings?.resetToThemeDefault();
        sync();
        noticeSuccess("Basemap reset", null, { countAsUnread: false });
        break;
      case "reset-all":
        if (context.mapPreferences) {
          await context.mapPreferences?.resetMapViewpoint();
          context.mapPreferences?.resetFilters();
          context.mapPreferences?.resetDisplayScaleHidingPreference();
          await context.dataSourceController?.resetToDefaults?.({
            reason: "preferences-reset",
          });
        }
        if (document.body.classList.contains("pc-dashboard-route")) {
          resetDashboardPageSizePreference();
        }
        resetThemePreference(context.themeView ?? context.view);
        context.basemapSettings?.resetToThemeDefault();
        sync();
        noticeSuccess("Preferences reset", null, { countAsUnread: false });
        break;
      default:
        break;
    }
    sync();
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (currentNavbarCoordinator) {
      return currentNavbarCoordinator.close(POPOVER_ID, { restoreFocus });
    }
    if (!isOpen()) return false;
    setOpen(false, { restoreFocus });
    return true;
  };

  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (currentNavbarCoordinator) currentNavbarCoordinator.toggle(POPOVER_ID);
    else setOpen(!isOpen(), { restoreFocus: true });
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = getTargetElement(event);
    const actionButton = target?.closest("[data-preference-action]");
    if (actionButton) void handleAction(actionButton.dataset.preferenceAction);
  });

  panel.addEventListener("calciteSwitchChange", (event) => {
    event.stopPropagation();
    const target = getTargetElement(event);
    const switchElement = target?.closest("calcite-switch");
    if (!switchElement) return;

    if (switchElement.id === "preferences-dark-mode") {
      const wantsDarkMode = switchElement.checked;
      const darkModeIsActive = getCurrentTheme() === themes.dark;
      if (wantsDarkMode !== darkModeIsActive) {
        toggleTheme(context.themeView ?? context.view);
      }
      sync();
      return;
    }

    if (!switchElement.dataset.preferencePersistenceKey) return;
    const didChange = setPreferencePersistenceEnabled(
      switchElement.dataset.preferencePersistenceKey,
      switchElement.checked
    );
    sync();
    if (!didChange) return;
    const item = PREFERENCE_ITEMS.find(
      (entry) => entry.key === switchElement.dataset.preferencePersistenceKey
    );
    noticeSuccess(
      `${item?.noticeTitle ?? item?.title ?? "Preference"} persistence ${
        switchElement.checked ? "enabled" : "disabled"
      }`,
      null,
      { countAsUnread: false }
    );
  });

  const handleDocumentClick = (event) => {
    const target = getTargetElement(event);
    if (
      currentNavbarCoordinator ||
      !target ||
      panel.hidden ||
      panel.contains(target) ||
      button.contains(target)
    )
      return;
    setOpen(false);
  };
  const handleResize = () => {
    if (isOpen()) positionPanel(button, panel);
  };

  const handleKeydown = (event) => {
    // Main map keeps its existing top-most-layer Escape coordinator.
    if (context.mapPreferences || event.key !== "Escape" || event.defaultPrevented || !isOpen()) {
      return;
    }
    event.preventDefault();
    setOpen(false, { restoreFocus: true });
  };
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("resize", handleResize);

  const api = {
    close,
    updateContext(nextContext = {}) {
      activePanel?.updateContext(nextContext);
    },
    destroy() {
      displayScaleControlHandle?.remove();
      unsubscribeBasemapSettings?.();
      persistenceHandle.remove();
      unregisterPopover?.();
      unregisterPopover = null;
      currentNavbarCoordinator = null;
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("resize", handleResize);
      panel.remove();
      button.remove();
      activePanel = null;
    },
  };
  activePanel = {
    api,
    updateContext(nextContext = {}) {
      if (
        Object.prototype.hasOwnProperty.call(nextContext, "navbarPopoverCoordinator") &&
        nextContext.navbarPopoverCoordinator !== undefined &&
        nextContext.navbarPopoverCoordinator !== currentNavbarCoordinator
      ) {
        unregisterPopover?.();
        currentNavbarCoordinator = nextContext.navbarPopoverCoordinator ?? null;
        unregisterPopover = currentNavbarCoordinator?.register(POPOVER_ID, {
          open: ({ focusInitial = true } = {}) => setOpen(true, { focusInitial }),
          close: ({ restoreFocus = false } = {}) => setOpen(false, { restoreFocus }),
          isOpen,
          containsTarget: (target) =>
            Boolean(target && (panel.contains(target) || button.contains(target))),
        });
      }
      if (Object.prototype.hasOwnProperty.call(nextContext, "basemapSettings")) {
        if (context.basemapSettings !== nextContext.basemapSettings) {
          unsubscribeBasemapSettings?.();
          context.basemapSettings = nextContext.basemapSettings;
          unsubscribeBasemapSettings = context.basemapSettings?.subscribe(() => sync()) ?? null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(nextContext, "mapPreferences")) {
        context.mapPreferences = nextContext.mapPreferences;
      }
      if (Object.prototype.hasOwnProperty.call(nextContext, "view")) {
        context.view = nextContext.view;
      }
      if (Object.prototype.hasOwnProperty.call(nextContext, "dataSourceController")) {
        context.dataSourceController = nextContext.dataSourceController;
      }
      if (typeof nextContext.onStartIntroduction === "function") {
        context.onStartIntroduction = nextContext.onStartIntroduction;
      }
      if (
        Object.prototype.hasOwnProperty.call(nextContext, "themeView") &&
        nextContext.themeView !== undefined
      ) {
        context.themeView = nextContext.themeView;
      } else if (Object.prototype.hasOwnProperty.call(nextContext, "view")) {
        context.themeView = nextContext.view;
      }
      if (isOpen()) render();
    },
  };
  activePanel.updateContext({
    view,
    mapPreferences,
    dataSourceController,
    onStartIntroduction,
    themeView,
    basemapSettings,
    navbarPopoverCoordinator,
  });
  render();
  return api;
}

function renderThemeSetting(currentTheme) {
  const darkModeEnabled = currentTheme === themes.dark;

  return `
    <section class="pc-preferences-panel__setting pc-preferences-panel__setting--theme">
      <div class="pc-preferences-panel__copy">
        <h4 id="preferences-theme-label">Theme</h4>
      </div>
      <div class="pc-preferences-panel__theme-control" role="group" aria-labelledby="preferences-theme-label">
        <calcite-icon
          class="pc-preferences-panel__theme-icon"
          icon="brightness"
          scale="s"
          title="Light theme"
          aria-hidden="true"
        ></calcite-icon>
        <calcite-switch
          id="preferences-dark-mode"
          class="pc-preferences-panel__switch"
          label="Dark theme"
          ${darkModeEnabled ? "checked" : ""}
        ></calcite-switch>
        <calcite-icon
          class="pc-preferences-panel__theme-icon"
          icon="moon"
          scale="s"
          title="Dark theme"
          aria-hidden="true"
        ></calcite-icon>
      </div>
    </section>
  `;
}

function getBasemapDescription(settings) {
  const entry = settings.getOptions().find((option) => option.id === settings.getValue());
  const label = entry?.label ?? "Unavailable";
  return `${settings.isCustom() ? "Custom" : "Automatic"}: ${label}`;
}

function renderBasemapSetting(settings) {
  return `
    <section class="pc-preferences-panel__setting pc-preferences-panel__setting--basemap">
      <div class="pc-preferences-panel__copy">
        <h4>Basemap</h4>
        <p id="preferences-basemap-status">${escapeHtml(getBasemapDescription(settings))}</p>
      </div>
      <button
        type="button"
        class="pc-preferences-panel__theme-default"
        data-preference-action="reset-basemap"
        aria-label="Use theme default basemap"
      >Use theme default</button>
    </section>
  `;
}

function renderDisplayScaleSetting(mapPreferences) {
  const scaleHidingEnabled = !mapPreferences.isDisplayScaleHidingDisabled();

  return `
    <section class="pc-preferences-panel__setting pc-preferences-panel__setting--scale">
      <div class="pc-preferences-panel__copy">
        <h4 id="preferences-scale-hiding-label">Scale hiding</h4>
        <p id="preferences-scale-hiding-description">
          Hide Products outside their configured display scale range.
        </p>
      </div>
      <calcite-switch
        id="preferences-scale-hiding"
        class="pc-preferences-panel__switch"
        label="Scale hiding"
        aria-labelledby="preferences-scale-hiding-label"
        aria-describedby="preferences-scale-hiding-description"
        ${scaleHidingEnabled ? "checked" : ""}
      ></calcite-switch>
    </section>
  `;
}

function renderPreferenceItem(item, persistenceState) {
  const checked = persistenceState[item.key] !== false;
  return `
    <section class="pc-preferences-panel__item">
      <div class="pc-preferences-panel__copy">
        <h4>${escapeHtml(item.title)}</h4>
      </div>
      <label class="pc-preferences-panel__save">
      <span>Auto-save</span>
      <calcite-switch
        class="pc-preferences-panel__switch"
        data-preference-persistence-key="${escapeHtml(item.key)}"
        label="${escapeHtml(
          item.persistenceLabel ?? `Save ${item.title.toLowerCase()} in this browser`
        )}"
        ${checked ? "checked" : ""}
      ></calcite-switch>
      </label>
    </section>
  `;
}

function ensurePreferencesButton() {
  const existingButton = document.getElementById("preferences-button");
  if (existingButton) return existingButton;

  const container =
    document.querySelector("#header .header-right") ?? document.getElementById("navbar");
  if (!container) return null;
  const button = document.createElement("calcite-action");
  button.id = "preferences-button";
  button.icon = "gear";
  button.text = "Preferences";
  button.label = "Preferences";
  button.title = "Preferences";
  button.scale = "m";
  button.setAttribute("aria-label", "Preferences");
  container.appendChild(button);
  return button;
}

function positionPanel(button, panel) {
  const rect = button.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - 20)}px`;
  panel.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
}

function getTargetElement(event) {
  return event.target instanceof Element ? event.target : null;
}

function createEmptyApi() {
  return { close() {}, updateContext() {}, destroy() {} };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]
  );
}
