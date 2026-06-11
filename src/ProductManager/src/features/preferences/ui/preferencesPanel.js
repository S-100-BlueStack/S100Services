import { noticeSuccess } from "../../notices/services/noticeService.js";
import { resetMapViewpoint } from "../../map/state/mapViewpointPersistence.js";
import { resetDisplayScaleHidingPreference } from "../../map/scale/displayScaleOverrideState.js";
import { resetThemePreference } from "../../themes/themeService.js";
import { syncThemeToggle } from "../../themes/themeToggle.js";

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

  panel.innerHTML = `
    <div class="pm-preferences-panel__header">
      <div>
        <h2>Preferences</h2>
        <p>Reset saved frontend preferences for this browser.</p>
      </div>
    </div>

    <div class="pm-preferences-panel__content">
      <button type="button" class="pm-preferences-panel__action" data-preference-action="reset-map-view">
        <span>Reset map view</span>
        <small>Clear saved center, scale and rotation.</small>
      </button>

      <button type="button" class="pm-preferences-panel__action" data-preference-action="reset-filters">
        <span>Reset filters</span>
        <small>Clear active attribute filters.</small>
      </button>

      <button type="button" class="pm-preferences-panel__action" data-preference-action="reset-display-scale">
        <span>Reset display scale setting</span>
        <small>Use the default display-scale hiding behavior.</small>
      </button>

      <button type="button" class="pm-preferences-panel__action" data-preference-action="reset-theme">
        <span>Reset theme</span>
        <small>Switch back to light mode.</small>
      </button>

      <button type="button" class="pm-preferences-panel__action pm-preferences-panel__action--danger" data-preference-action="reset-all">
        <span>Reset all preferences</span>
        <small>Reset map view, filters, display scale setting and theme.</small>
      </button>
    </div>
  `;

  document.body.append(panel);

  function isOpen() {
    return !panel.hidden;
  }

  function setOpen(open) {
    panel.hidden = !open;
    button.toggleAttribute("active", open);

    if (open) {
      positionPanel(button, panel);
    }
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

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen());
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();

    const target = event.target instanceof Element ? event.target : null;
    const actionButton = target?.closest("[data-preference-action]");

    if (!actionButton) {
      return;
    }

    void handleAction(actionButton.dataset.preferenceAction);
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;

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
