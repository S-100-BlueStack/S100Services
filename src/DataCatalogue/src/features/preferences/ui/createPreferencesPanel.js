import { writeStoredThemeMode } from "../../theme/state/themeStorage.js";

const STORAGE_ROWS = [
  {
    key: "rememberBasemap",
    title: "Basemap",
    label: "Save basemap selection in this browser",
  },
  {
    key: "rememberMapPosition",
    title: "Map view",
    label: "Save map location and zoom in this browser",
  },
  {
    key: "rememberTheme",
    title: "Theme",
    label: "Save theme selection in this browser",
  },
];

// Keep the application-owned panel and preference lifecycle; only the presentation
// follows the Product Catalogue pattern of grouped settings and Calcite switches.
export function createPreferencesPanel({
  navbarElement,
  settings,
  themeStore,
  basemapSettings,
  documentRef = document,
}) {
  const button = navbarElement.querySelector("#preferences-button");
  const host = navbarElement.querySelector("#preferences-panel");
  if (!button || !host) throw new Error("Preferences navigation controls are missing.");

  const abort = new AbortController();
  const { signal } = abort;
  const create = (tag, className) => {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    return element;
  };
  const createCopy = (title, description) => {
    const copy = create("div", "dc-preferences__copy");
    const heading = create("h4");
    heading.textContent = title;
    copy.append(heading);
    if (description) {
      const detail = create("p");
      detail.textContent = description;
      copy.append(detail);
    }
    return copy;
  };

  const panel = create("section", "dc-preferences");
  const header = create("div", "dc-preferences__header");
  const heading = create("h2");
  heading.id = "data-catalogue-preferences-title";
  heading.textContent = "Preferences";
  const closeButton = create("button", "dc-preferences__close");
  closeButton.type = "button";
  closeButton.title = "Close Preferences";
  closeButton.setAttribute("aria-label", "Close Preferences");
  const closeIcon = create("calcite-icon");
  closeIcon.setAttribute("icon", "x");
  closeIcon.setAttribute("scale", "s");
  closeIcon.setAttribute("aria-hidden", "true");
  closeButton.append(closeIcon);
  header.append(heading, closeButton);

  const content = create("div", "dc-preferences__content");
  const displayGroup = create("section", "dc-preferences__group");
  const displayTitle = create("h3");
  displayTitle.textContent = "Display";
  displayGroup.append(displayTitle);

  const themeRow = create("div", "dc-preferences__setting");
  const themeCopy = createCopy("Theme");
  const themeControl = create("div", "dc-preferences__theme-control");
  const lightIcon = create("calcite-icon", "dc-preferences__theme-icon");
  lightIcon.setAttribute("icon", "brightness");
  lightIcon.setAttribute("scale", "s");
  lightIcon.setAttribute("aria-hidden", "true");
  const themeSwitch = create("calcite-switch", "dc-preferences__switch");
  themeSwitch.id = "data-catalogue-dark-mode";
  themeSwitch.setAttribute("label", "Dark theme");
  const darkIcon = create("calcite-icon", "dc-preferences__theme-icon");
  darkIcon.setAttribute("icon", "moon");
  darkIcon.setAttribute("scale", "s");
  darkIcon.setAttribute("aria-hidden", "true");
  themeControl.append(lightIcon, themeSwitch, darkIcon);
  themeRow.append(themeCopy, themeControl);

  const basemapRow = create("div", "dc-preferences__setting dc-preferences__setting--basemap");
  const basemapCopy = createCopy("Basemap");
  const basemapDescription = create("p", "dc-preferences__basemap-status");
  basemapCopy.append(basemapDescription);
  const resetBasemap = create("button", "dc-preferences__reset-basemap");
  resetBasemap.type = "button";
  resetBasemap.textContent = "Use theme default";
  resetBasemap.title = "Automatically select a basemap to match the theme";
  basemapRow.append(basemapCopy, resetBasemap);
  displayGroup.append(themeRow, basemapRow);

  const savedGroup = create("section", "dc-preferences__group");
  const savedTitle = create("h3");
  savedTitle.textContent = "Saved preferences";
  const savedDescription = create("p", "dc-preferences__group-description");
  savedDescription.textContent = "Choose which preferences are remembered in this browser.";
  savedGroup.append(savedTitle, savedDescription);

  const controls = new Map();
  for (const { key, title, label } of STORAGE_ROWS) {
    const row = create("div", "dc-preferences__item");
    const autoSave = create("label", "dc-preferences__auto-save");
    const autoSaveText = create("span");
    autoSaveText.textContent = "Auto-save";
    const input = create("calcite-switch", "dc-preferences__switch");
    input.setAttribute("label", label);
    input.name = key;
    input.addEventListener(
      "calciteSwitchChange",
      () => {
        settings.set(key, input.checked);
        if (key === "rememberTheme" && input.checked) {
          writeStoredThemeMode(settings.themeStorage, themeStore.getSnapshot().themeMode);
        }
      },
      { signal }
    );
    autoSave.append(autoSaveText, input);
    row.append(createCopy(title), autoSave);
    controls.set(key, input);
    savedGroup.append(row);
  }
  content.append(displayGroup, savedGroup);
  panel.append(header, content);
  host.replaceChildren(panel);
  host.setAttribute("aria-labelledby", heading.id);
  button.setAttribute("aria-controls", "preferences-panel");

  function positionPanel() {
    const viewport = documentRef.defaultView;
    const bounds = button.getBoundingClientRect?.();
    if (!viewport || !bounds) return;
    host.style.top = `${Math.round(bounds.bottom + 8)}px`;
    if (viewport.innerWidth <= 480) {
      host.style.left = "12px";
      host.style.right = "12px";
    } else {
      host.style.left = "";
      host.style.right = `${Math.max(12, Math.round(viewport.innerWidth - bounds.right))}px`;
    }
    const availableHeight = Math.max(80, Math.floor(viewport.innerHeight - bounds.bottom - 20));
    host.style.maxHeight = `${availableHeight}px`;
  }

  function setOpen(open, { restoreFocus = false } = {}) {
    const wasOpen = !host.hidden;
    host.hidden = !open;
    host.inert = !open;
    button.active = open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      positionPanel();
      // Calcite's public focus method reaches the switch inside its shadow root.
      if (typeof themeSwitch.setFocus === "function") {
        void themeSwitch.setFocus({ preventScroll: true });
      } else {
        themeSwitch.focus?.({ preventScroll: true });
      }
    } else if (wasOpen && restoreFocus) {
      if (typeof button.setFocus === "function") {
        void button.setFocus({ preventScroll: true });
      } else {
        button.focus?.({ preventScroll: true });
      }
    }
  }

  const unsubscribeSettings = settings.subscribe((snapshot) => {
    for (const [key, input] of controls) input.checked = snapshot[key];
  });
  const unsubscribeTheme = themeStore.subscribe(({ themeMode }) => {
    themeSwitch.checked = themeMode === "dark";
  });
  const unsubscribeBasemap =
    basemapSettings?.subscribe(() => {
      const manual = basemapSettings.isCustom();
      const choice = basemapSettings
        .getOptions()
        .find((entry) => entry.id === basemapSettings.getValue());
      const selectionMode = manual ? "Custom" : "Automatic";
      basemapDescription.textContent = `${selectionMode}: ${choice?.label ?? "Unavailable"}`;
      resetBasemap.disabled = !manual;
    }) ?? (() => {});
  if (!basemapSettings) {
    basemapDescription.textContent = "Unavailable";
    resetBasemap.disabled = true;
  }

  themeSwitch.addEventListener(
    "calciteSwitchChange",
    () => {
      const next = themeSwitch.checked ? "dark" : "light";
      if (themeStore.getSnapshot().themeMode !== next) themeStore.setThemeMode(next);
    },
    { signal }
  );
  resetBasemap.addEventListener("click", () => basemapSettings?.resetToThemeDefault(), { signal });
  closeButton.addEventListener("click", () => setOpen(false, { restoreFocus: true }), { signal });
  button.addEventListener("click", () => setOpen(host.hidden, { restoreFocus: true }), { signal });
  documentRef.addEventListener(
    "pointerdown",
    (event) => {
      if (host.hidden) return;
      const path = event.composedPath?.() ?? [];
      if (
        host.contains(event.target) ||
        button.contains(event.target) ||
        path.includes(host) ||
        path.includes(button)
      )
        return;
      setOpen(false);
    },
    { signal }
  );
  documentRef.addEventListener(
    "keydown",
    (event) => {
      if (host.hidden || event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
    },
    { signal }
  );
  documentRef.defaultView?.addEventListener(
    "resize",
    () => {
      if (!host.hidden) positionPanel();
    },
    { signal }
  );
  setOpen(false);

  return {
    destroy() {
      setOpen(false);
      abort.abort();
      unsubscribeSettings();
      unsubscribeTheme();
      unsubscribeBasemap();
      host.replaceChildren();
    },
  };
}
