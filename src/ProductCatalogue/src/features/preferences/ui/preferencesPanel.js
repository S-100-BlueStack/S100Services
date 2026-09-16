import { noticeSuccess } from "../../notices/services/noticeService.js";
import { resetDashboardPageSizePreference } from "../../dashboard/state/dashboardPageSizePreference.js";
import { resetMapViewpoint } from "../../map/state/mapViewpointPersistence.js";
import { bindDisplayScaleOverrideControl } from "../../map/scale/displayScaleOverrideControl.js";
import {
  isDisplayScaleHidingDisabled,
  resetDisplayScaleHidingPreference,
} from "../../map/scale/displayScaleOverrideState.js";
import {
  applyTheme,
  getCurrentTheme,
  resetThemePreference,
  themes,
} from "../../themes/themeService.js";
import {
  PREFERENCE_PERSISTENCE_KEY,
  getPreferencePersistenceState,
  setPreferencePersistenceEnabled,
} from "../state/preferencePersistenceState.js";

const PREFERENCE_ITEMS = [
  {
    key: PREFERENCE_PERSISTENCE_KEY.MAP_VIEWPOINT,
    resetAction: "reset-map-view",
    title: "Map view",
    description: "Save center, scale and rotation in this browser.",
    resetLabel: "Reset",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS,
    resetAction: "reset-filters",
    title: "Filters",
    description: "Save active attribute filters in this browser.",
    resetLabel: "Reset",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE,
    title: "Save Scale hiding",
    description: "Retain the Scale hiding setting in this browser.",
    persistenceLabel: "Save Scale hiding setting in this browser",
    noticeTitle: "Scale hiding",
    requiresMapContext: true,
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.THEME,
    resetAction: "reset-theme",
    title: "Theme",
    description: "Save light or dark mode in this browser.",
    resetLabel: "Reset",
  },
];
let activePanel = null;

export function initPreferencesPanel({
  view,
  filterPanel,
  dataSourceController,
  onStartIntroduction,
  themeView,
} = {}) {
  if (activePanel) {
    activePanel.updateContext({
      view,
      filterPanel,
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
    filterPanel: null,
    dataSourceController: null,
    onStartIntroduction: null,
    themeView: null,
  };

  const isOpen = () => !panel.hidden;
  let displayScaleControlHandle = null;
  const render = () => {
    displayScaleControlHandle?.remove();
    displayScaleControlHandle = null;

    const persistenceState = getPreferencePersistenceState();
    const availableItems = PREFERENCE_ITEMS.filter(
      (item) => !item.requiresMapContext || context.view
    );

    panel.innerHTML = `
      <div class="pc-preferences-panel__header">
        <div>
          <h2>Preferences</h2>
          <p>Manage saved frontend preferences for this browser.</p>
        </div>
      </div>
      <div class="pc-preferences-panel__content">
        <button
          type="button"
          class="pc-preferences-panel__action"
          data-preference-action="start-introduction"
        >
          <span>Start introduction</span>
          <small>Show a short guide to the controls on this page.</small>
        </button>

        ${renderThemeSelector(getCurrentTheme())}
        ${context.view ? renderDisplayScaleSetting() : ""}
        ${availableItems.map((item) => renderPreferenceItem(item, persistenceState)).join("")}
        <button
          type="button"
          class="pc-preferences-panel__reset-all"
          data-preference-action="reset-all"
        >
          <span>Reset available preferences</span>
          <small>Reset the preferences available on this page.</small>
        </button>
      </div>
    `;

    if (context.view) {
      displayScaleControlHandle = bindDisplayScaleOverrideControl(
        panel.querySelector("#preferences-scale-hiding")
      );
    }
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    button.toggleAttribute("active", open);

    if (open) {
      render();
      positionPanel(button, panel);
    }
  };

  const handleAction = async (action) => {
    switch (action) {
      case "start-introduction":
        setOpen(false);
        context.onStartIntroduction?.();
        break;
      case "reset-map-view":
        await resetMapViewpoint(context.view);
        noticeSuccess("Map view reset", null, { countAsUnread: false });
        break;
      case "reset-filters":
        context.filterPanel?.clearAllFilters?.();
        noticeSuccess("Filters reset", null, { countAsUnread: false });
        break;
      case "reset-display-scale":
        resetDisplayScaleHidingPreference();
        render();
        noticeSuccess("Scale hiding reset", null, { countAsUnread: false });
        break;
      case "reset-theme":
        resetThemePreference(context.themeView ?? context.view);
        render();
        noticeSuccess("Theme reset", null, { countAsUnread: false });
        break;
      case "reset-all":
        if (context.view) {
          await resetMapViewpoint(context.view);
          context.filterPanel?.clearAllFilters?.();
          resetDisplayScaleHidingPreference();
          await context.dataSourceController?.resetToDefaults?.({
            reason: "preferences-reset",
          });
        }
        if (document.body.classList.contains("pc-dashboard-route")) {
          resetDashboardPageSizePreference();
        }
        resetThemePreference(context.themeView ?? context.view);
        render();
        noticeSuccess("Preferences reset", null, { countAsUnread: false });
        break;
      default:
        break;
    }
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen());
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
    const switchElement = target?.closest("calcite-switch[data-preference-persistence-key]");
    if (!switchElement) return;

    const didChange = setPreferencePersistenceEnabled(
      switchElement.dataset.preferencePersistenceKey,
      switchElement.checked
    );
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

  panel.addEventListener("change", (event) => {
    event.stopPropagation();
    const target = getTargetElement(event);
    const themeOption = target?.closest("input[data-preference-theme]");
    if (!themeOption?.checked) return;

    applyTheme(themeOption.value, context.themeView ?? context.view);
  });

  const handleDocumentClick = (event) => {
    const target = getTargetElement(event);
    if (!target || panel.hidden || panel.contains(target) || button.contains(target)) return;
    setOpen(false);
  };
  const handleResize = () => {
    if (isOpen()) positionPanel(button, panel);
  };

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("resize", handleResize);

  const api = {
    close: () => setOpen(false),
    updateContext(nextContext = {}) {
      activePanel?.updateContext(nextContext);
    },
    destroy() {
      displayScaleControlHandle?.remove();
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
      if (Object.prototype.hasOwnProperty.call(nextContext, "view")) {
        context.view = nextContext.view;
      }
      if (Object.prototype.hasOwnProperty.call(nextContext, "filterPanel")) {
        context.filterPanel = nextContext.filterPanel;
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
    filterPanel,
    dataSourceController,
    onStartIntroduction,
    themeView,
  });
  render();
  return api;
}

function renderThemeSelector(currentTheme) {
  return `
    <fieldset class="pc-preferences-panel__theme">
      <legend>Theme</legend>
      <p>Choose the application appearance.</p>
      <div class="pc-preferences-panel__theme-options">
        ${renderThemeOption(themes.light, "Light", currentTheme)}
        ${renderThemeOption(themes.dark, "Dark", currentTheme)}
      </div>
    </fieldset>
  `;
}

function renderThemeOption(value, label, currentTheme) {
  return `
    <label class="pc-preferences-panel__theme-option">
      <input
        type="radio"
        name="product-catalogue-theme"
        value="${escapeHtml(value)}"
        data-preference-theme
        ${currentTheme === value ? "checked" : ""}
      />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderDisplayScaleSetting() {
  const scaleHidingEnabled = !isDisplayScaleHidingDisabled();

  return `
    <section class="pc-preferences-panel__setting">
      <div class="pc-preferences-panel__copy">
        <h3 id="preferences-scale-hiding-label">Scale hiding</h3>
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
      <button
        type="button"
        class="pc-preferences-panel__reset"
        data-preference-action="reset-display-scale"
      >Reset</button>
    </section>
  `;
}

function renderPreferenceItem(item, persistenceState) {
  const checked = persistenceState[item.key] !== false;
  return `
    <section class="pc-preferences-panel__item">
      <div class="pc-preferences-panel__copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <calcite-switch
        class="pc-preferences-panel__switch"
        data-preference-persistence-key="${escapeHtml(item.key)}"
        label="${escapeHtml(
          item.persistenceLabel ?? `Save ${item.title.toLowerCase()} in this browser`
        )}"
        ${checked ? "checked" : ""}
      ></calcite-switch>
      ${
        item.resetAction
          ? `<button
              type="button"
              class="pc-preferences-panel__reset"
              data-preference-action="${escapeHtml(item.resetAction)}"
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
