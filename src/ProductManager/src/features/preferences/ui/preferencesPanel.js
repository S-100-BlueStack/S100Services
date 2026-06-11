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
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.ATTRIBUTE_FILTERS,
    resetAction: "reset-filters",
    title: "Filters",
    description: "Save active attribute filters in this browser.",
    resetLabel: "Reset",
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE,
    resetAction: "reset-display-scale",
    title: "Display scale setting",
    description: "Save the display-scale hiding setting in this browser.",
    resetLabel: "Reset",
  },
  {
    key: PREFERENCE_PERSISTENCE_KEY.THEME,
    resetAction: "reset-theme",
    title: "Theme",
    description: "Save light or dark mode in this browser.",
    resetLabel: "Reset",
  },
];

export function initPreferencesPanel({ view, filterPanel } = {}) {
  const button = ensurePreferencesButton();

  if (!button) {
    return {
      close() {},
      destroy() {},
    };
  }

  const panel = document.createElement("section");
  panel.id = "preferences-panel";
  panel.className = "pm-preferences-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Preferences");

  document.body.append(panel);
  render();

  function isOpen() {
    return !panel.hidden;
  }

  function setOpen(open) {
    panel.hidden = !open;
    button.toggleAttribute("active", open);

    if (open) {
      render();
      positionPanel(button, panel);
    }
  }

  function render() {
    const persistenceState = getPreferencePersistenceState();

    panel.innerHTML = `
      <div class="pm-preferences-panel__header">
        <div>
          <h2>Preferences</h2>
          <p>Manage saved frontend preferences for this browser.</p>
        </div>
      </div>

      <div class="pm-preferences-panel__content">
        ${PREFERENCE_ITEMS.map((item) => renderPreferenceItem(item, persistenceState)).join("")}

        <button
          type="button"
          class="pm-preferences-panel__reset-all"
          data-preference-action="reset-all"
        >
          <span>Reset all preferences</span>
          <small>Reset map view, filters, display scale setting and theme.</small>
        </button>
      </div>
    `;
  }

  async function handleAction(action) {
    switch (action) {
      case "reset-map-view":
        await resetMapViewpoint(view);
        noticeSuccess("Map view reset", null, { countAsUnread: false });
        break;

      case "reset-filters":
        filterPanel?.clearAllFilters?.();
        noticeSuccess("Filters reset", null, { countAsUnread: false });
        break;

      case "reset-display-scale":
        resetDisplayScaleHidingPreference();
        noticeSuccess("Display scale setting reset", null, { countAsUnread: false });
        break;

      case "reset-theme":
        resetThemePreference(view);
        syncThemeToggle();
        noticeSuccess("Theme reset", null, { countAsUnread: false });
        break;

      case "reset-all":
        await resetMapViewpoint(view);
        filterPanel?.clearAllFilters?.();
        resetDisplayScaleHidingPreference();
        resetThemePreference(view);
        syncThemeToggle();
        noticeSuccess("Preferences reset", null, { countAsUnread: false });
        break;

      default:
        break;
    }
  }

  function handlePersistenceToggle(key, enabled) {
    const didChange = setPreferencePersistenceEnabled(key, enabled);

    if (!didChange) {
      return;
    }

    const item = PREFERENCE_ITEMS.find((entry) => entry.key === key);
    const label = item?.title ?? "Preference";
    const stateLabel = enabled ? "enabled" : "disabled";

    noticeSuccess(`${label} persistence ${stateLabel}`, null, {
      countAsUnread: false,
    });
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen());
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();

    const target = getTargetElement(event);
    const actionButton = target?.closest("[data-preference-action]");

    if (!actionButton) {
      return;
    }

    void handleAction(actionButton.dataset.preferenceAction);
  });

  panel.addEventListener("calciteSwitchChange", (event) => {
    event.stopPropagation();

    const target = getTargetElement(event);
    const switchElement = target?.closest("calcite-switch[data-preference-persistence-key]");

    if (!switchElement) {
      return;
    }

    handlePersistenceToggle(switchElement.dataset.preferencePersistenceKey, switchElement.checked);
  });

  document.addEventListener("click", (event) => {
    const target = getTargetElement(event);

    if (!target || panel.hidden) {
      return;
    }

    if (panel.contains(target) || button.contains(target)) {
      return;
    }

    setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (isOpen()) {
      positionPanel(button, panel);
    }
  });

  return {
    close: () => setOpen(false),

    destroy() {
      panel.remove();
      button.remove();
    },
  };
}

function renderPreferenceItem(item, persistenceState) {
  const checked = persistenceState[item.key] !== false;

  return `
    <section class="pm-preferences-panel__item">
      <div class="pm-preferences-panel__copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </div>

      <calcite-switch
        class="pm-preferences-panel__switch"
        data-preference-persistence-key="${escapeHtml(item.key)}"
        label="${escapeHtml(`Save ${item.title.toLowerCase()} in this browser`)}"
        ${checked ? "checked" : ""}
      ></calcite-switch>

      <button
        type="button"
        class="pm-preferences-panel__reset"
        data-preference-action="${escapeHtml(item.resetAction)}"
      >
        ${escapeHtml(item.resetLabel)}
      </button>
    </section>
  `;
}

function ensurePreferencesButton() {
  const existingButton = document.getElementById("preferences-button");

  if (existingButton) {
    return existingButton;
  }

  const container =
    document.querySelector("#header .header-right") ?? document.getElementById("navbar");

  if (!container) {
    return null;
  }

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}
