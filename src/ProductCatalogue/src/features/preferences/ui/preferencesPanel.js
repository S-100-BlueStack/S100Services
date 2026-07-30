import { noticeSuccess } from "../../notices/services/noticeService.js";
import { resetMapViewpoint } from "../../map/state/mapViewpointPersistence.js";
import { resetDisplayScaleHidingPreference } from "../../map/scale/displayScaleOverrideState.js";
import { resetThemePreference } from "../../themes/themeService.js";
import { syncThemeToggle } from "../../themes/themeToggle.js";
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
    resetAction: "reset-display-scale",
    title: "Display scale setting",
    description: "Save the display-scale hiding setting in this browser.",
    resetLabel: "Reset",
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

export function initPreferencesPanel({ view, filterPanel, onStartIntroduction } = {}) {
  if (activePanel) {
    activePanel.updateContext({ view, filterPanel, onStartIntroduction });
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
    onStartIntroduction: null,
  };

  const isOpen = () => !panel.hidden;

  const render = () => {
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
        noticeSuccess("Display scale setting reset", null, { countAsUnread: false });
        break;
      case "reset-theme":
        resetThemePreference(context.view);
        syncThemeToggle();
        noticeSuccess("Theme reset", null, { countAsUnread: false });
        break;
      case "reset-all":
        if (context.view) {
          await resetMapViewpoint(context.view);
          context.filterPanel?.clearAllFilters?.();
          resetDisplayScaleHidingPreference();
        }
        resetThemePreference(context.view);
        syncThemeToggle();
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
      `${item?.title ?? "Preference"} persistence ${switchElement.checked ? "enabled" : "disabled"}`,
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

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("resize", handleResize);

  const api = {
    close: () => setOpen(false),
    destroy() {
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
      if (Object.prototype.hasOwnProperty.call(nextContext, "view"))
        context.view = nextContext.view;
      if (Object.prototype.hasOwnProperty.call(nextContext, "filterPanel")) {
        context.filterPanel = nextContext.filterPanel;
      }
      if (typeof nextContext.onStartIntroduction === "function") {
        context.onStartIntroduction = nextContext.onStartIntroduction;
      }
      if (isOpen()) render();
    },
  };

  activePanel.updateContext({ view, filterPanel, onStartIntroduction });
  render();
  return api;
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
        label="${escapeHtml(`Save ${item.title.toLowerCase()} in this browser`)}"
        ${checked ? "checked" : ""}
      ></calcite-switch>
      <button
        type="button"
        class="pc-preferences-panel__reset"
        data-preference-action="${escapeHtml(item.resetAction)}"
      >${escapeHtml(item.resetLabel)}</button>
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
  button.label = "Preferences";
  button.title = "Preferences";
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
  return { close() {}, destroy() {} };
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
