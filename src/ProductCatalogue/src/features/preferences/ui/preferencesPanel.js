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
    key: PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT,
    resetAction: "reset-map-view",
    title: "Map view",
    resetLabel: "Reset map view",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS,
    resetAction: "reset-filters",
    title: "Filters",
    resetLabel: "Reset filters",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE,
    title: "Scale hiding",
    persistenceLabel: "Save Scale hiding setting in this browser",
    noticeTitle: "Scale hiding",
    resetAction: "reset-display-scale",
    resetLabel: "Reset to OFF",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.THEME,
    resetAction: "reset-theme",
    title: "Theme",
    resetLabel: "Reset to Light",
  },
];
let activePanel = null;

export function initPreferencesPanel({
  view,
  mapPreferences,
  dataSourceController,
  onStartIntroduction,
  themeView,
} = {}) {
  if (activePanel) {
    activePanel.updateContext({
      view,
      mapPreferences,
      dataSourceController,
      onStartIntroduction,
      themeView,
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
  };

  const isOpen = () => !panel.hidden;
  let displayScaleControlHandle = null;
  const render = () => {
    const focusedIdentity = panel.contains(document.activeElement)
      ? document.activeElement.dataset.preferenceFocus
      : null;
    displayScaleControlHandle?.remove();
    displayScaleControlHandle = null;

    const persistenceState = getPreferencePersistenceState();
    const availableItems = PREFERENCE_ITEMS.filter(
      (item) => !item.requiresMapContext || context.mapPreferences
    );

    panel.innerHTML = `
      <div class="pc-preferences-panel__header">
        <div>
          <h2>Preferences</h2>
        </div>
      </div>
      <div class="pc-preferences-panel__content">
        ${renderThemeSetting(getCurrentTheme())}
        ${context.mapPreferences ? renderDisplayScaleSetting(context.mapPreferences) : ""}
        <section class="pc-preferences-panel__group" aria-labelledby="preferences-saved-heading">
        <h3 id="preferences-saved-heading">Saved preferences</h3>
        <p>Choose which preferences are remembered. Turning Auto-save off removes the saved value.</p>
        ${availableItems.map((item) => renderPreferenceItem(item, persistenceState)).join("")}
        ${
          document.body.classList.contains("pc-dashboard-route")
            ? `
          <section class="pc-preferences-panel__item">
            <div class="pc-preferences-panel__copy">
              <h4>Dashboard page size</h4>
            </div>
            <button type="button" class="pc-preferences-panel__reset"
              data-preference-action="reset-dashboard-page-size">Reset to 50</button>
          </section>`
            : ""
        }
        <button
          type="button"
          class="pc-preferences-panel__reset-all"
          data-preference-action="reset-all"
        >
          <span>Reset available preferences</span>
          <small>${
            context.mapPreferences
              ? "Reset map view, filters, Scale hiding, source selection and Theme."
              : document.body.classList.contains("pc-dashboard-route")
                ? "Reset Theme and Dashboard page size to 50."
                : "Reset Theme to Light."
          } Auto-save choices are unchanged.</small>
        </button>
      </section>
      <section class="pc-preferences-panel__introduction" aria-label="Introduction">
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
    const scale = panel.querySelector("#preferences-scale-hiding");
    if (scale && context.mapPreferences) {
      scale.checked = !context.mapPreferences.isDisplayScaleHidingDisabled();
    }
  };
  // Owner subscribers may run later in the same persistence event dispatch.
  const persistenceHandle = onPreferencePersistenceChanged(() => queueMicrotask(sync));

  const setOpen = (open, { restoreFocus = false } = {}) => {
    const wasOpen = isOpen();
    panel.hidden = !open;
    button.toggleAttribute("active", open);
    button.setAttribute("aria-expanded", String(open));

    if (open) {
      render();
      positionPanel(button, panel);
      const initialFocus =
        panel.querySelector("#preferences-dark-mode") ??
        panel.querySelector("[data-preference-action]");
      if (initialFocus?.setFocus) void initialFocus.setFocus();
      else initialFocus?.focus();
    } else if (wasOpen && restoreFocus) {
      button.setFocus?.();
      if (!button.setFocus) button.focus();
    }
  };

  const handleAction = async (action) => {
    switch (action) {
      case "start-introduction":
        setOpen(false);
        context.onStartIntroduction?.();
        break;
      case "reset-map-view":
        await context.mapPreferences?.resetMapViewpoint();
        noticeSuccess("Map view reset", null, { countAsUnread: false });
        break;
      case "reset-filters":
        context.mapPreferences?.resetFilters();
        noticeSuccess("Filters reset", null, { countAsUnread: false });
        break;
      case "reset-display-scale":
        context.mapPreferences?.resetDisplayScaleHidingPreference();
        sync();
        noticeSuccess("Scale hiding reset", null, { countAsUnread: false });
        break;
      case "reset-dashboard-page-size":
        resetDashboardPageSizePreference();
        break;
      case "reset-theme":
        resetThemePreference(context.themeView ?? context.view);
        sync();
        noticeSuccess("Theme reset", null, { countAsUnread: false });
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
        sync();
        noticeSuccess("Preferences reset", null, { countAsUnread: false });
        break;
      default:
        break;
    }
    sync();
  };

  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen(), { restoreFocus: true });
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
    if (!target || panel.hidden || panel.contains(target) || button.contains(target)) return;
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
    close: () => setOpen(false, { restoreFocus: true }),
    updateContext(nextContext = {}) {
      activePanel?.updateContext(nextContext);
    },
    destroy() {
      displayScaleControlHandle?.remove();
      persistenceHandle.remove();
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

function renderDisplayScaleSetting(mapPreferences) {
  const scaleHidingEnabled = !mapPreferences.isDisplayScaleHidingDisabled();

  return `
    <section class="pc-preferences-panel__setting">
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
      ${
        item.resetAction
          ? `<button
              type="button"
              class="pc-preferences-panel__reset"
              data-preference-action="${escapeHtml(item.resetAction)}"
              aria-label="${escapeHtml(`${item.resetLabel}: ${item.title}`)}"
            >${escapeHtml(item.resetLabel)}</button>`
          : ""
      }
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
